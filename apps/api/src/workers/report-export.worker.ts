import { createHash } from 'node:crypto';
import { recordAudit } from '@construction-erp/audit';
import { loadServerConfig, type ServerConfig } from '@construction-erp/config';
import {
  createDatabaseClient,
  disconnectDatabase,
  withTransaction,
  type DatabaseClient,
  type TransactionClient
} from '@construction-erp/database';
import { AppError } from '@construction-erp/errors';
import { createStructuredLogger, toSafeErrorLog } from '@construction-erp/logging';
import { recordOutboxEvent } from '@construction-erp/outbox';
import {
  claimQueueJobs,
  completeQueueJob,
  failQueueJob,
  type ClaimedQueueJob,
  type QueueProjectScopeSnapshot
} from '@construction-erp/queue';
import {
  bindRequestSecurityContext,
  createRequestContext,
  runWithRequestContext,
  type ProjectScope
} from '@construction-erp/request-context';
import {
  buildCompanyObjectKey,
  createS3ObjectStorage,
  type ObjectStorage
} from '@construction-erp/storage';
import { AdministrationRepository } from '../modules/administration/administration.repository.js';
import { DocumentsRepository } from '../modules/documents-audit/documents-audit.repository.js';
import { ReportsRepository } from '../modules/reports/reports.repository.js';
import { ReportsService } from '../modules/reports/reports.service.js';
import {
  REPORT_CODES,
  REPORT_EXPORT_JOB_TYPE,
  REPORT_EXPORT_QUEUE_NAME,
  REPORT_OUTPUT_FORMATS,
  reportFiltersSchema,
  type ReportCode,
  type ReportFilters,
  type ReportOutputFormat,
  type RunReportResponse
} from '../modules/reports/reports.schema.js';

const POLL_INTERVAL_MS = 1_000;
const RETRY_DELAY_MS = 30_000;
const WORKER_ID = `report-exports-${process.pid}`;
const ACTIVE = 'ACTIVE';
const PDF_LINES_PER_PAGE = 48;
const PDF_LINE_WIDTH = 104;

type ReportExportJobPayload = Readonly<{ runId: string }>;

type ExportArtifact = Readonly<{
  body: Uint8Array;
  fileName: string;
  mimeType: string;
  checksum: string;
}>;

type StoredReportRun = NonNullable<Awaited<ReturnType<ReportsRepository['findReportRunById']>>>;

let stopping = false;

/** Load validated shared server configuration for the report export worker. */
function resolveConfig(): ServerConfig {
  return loadServerConfig(process.env);
}

/** Return true only for one frozen Final-21 report code. */
function isReportCode(value: unknown): value is ReportCode {
  return typeof value === 'string' && (REPORT_CODES as readonly string[]).includes(value);
}

/** Return true only for one frozen report export format. */
function isReportOutputFormat(value: unknown): value is ReportOutputFormat {
  return typeof value === 'string' && (REPORT_OUTPUT_FORMATS as readonly string[]).includes(value);
}

/** Validate the small durable queue payload used by report export jobs. */
function readJobPayload(job: ClaimedQueueJob): ReportExportJobPayload {
  if (job.envelope.jobType !== REPORT_EXPORT_JOB_TYPE) throw new Error('REPORT_EXPORT_JOB_INVALID');
  const runId = job.envelope.payload.runId;
  if (typeof runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(runId)) {
    throw new Error('REPORT_EXPORT_JOB_INVALID');
  }
  return { runId };
}

/** Keep the export inside both the queued scope snapshot and the user's current Project scope. */
function intersectProjectScope(current: ProjectScope, queued: QueueProjectScopeSnapshot): ProjectScope {
  if (queued.kind === 'not-resolved' || current.kind === 'not-resolved') {
    throw new Error('REPORT_SCOPE_FORBIDDEN');
  }
  if (queued.kind === 'all') return current;
  if (current.kind === 'all') return { kind: 'restricted', projectIds: [...queued.projectIds] };

  const currentIds = new Set(current.projectIds);
  return {
    kind: 'restricted',
    projectIds: queued.projectIds.filter((projectId) => currentIds.has(projectId))
  };
}

/** Resolve current user permissions and Project visibility without expanding the queued scope snapshot. */
async function resolveJobSecurity(database: DatabaseClient, job: ClaimedQueueJob) {
  const actorUserId = job.envelope.actorUserId;
  if (!actorUserId) throw new Error('REPORT_SCOPE_FORBIDDEN');
  const user = await database.user.findUnique({
    where: { id: actorUserId },
    select: { companyId: true, status: true }
  });
  if (!user || user.companyId !== job.envelope.companyId || user.status !== ACTIVE) {
    throw new Error('REPORT_SCOPE_FORBIDDEN');
  }

  const administration = new AdministrationRepository(database);
  const lookup = {
    userId: actorUserId,
    asOf: new Date(),
    assignmentStatuses: [ACTIVE],
    roleStatuses: [ACTIVE]
  } as const;
  const [permissions, currentProjectScope] = await Promise.all([
    administration.findEffectivePermissionCodesForAuthentication(lookup),
    administration.resolveProjectScopeForAuthentication({ ...lookup, projectScopeStatuses: [ACTIVE] })
  ]);

  return {
    actorUserId,
    companyId: user.companyId,
    permissions,
    projectScope: intersectProjectScope(currentProjectScope, job.envelope.projectScope)
  } as const;
}

/** Run one callback inside a trusted request context reconstructed from the durable queue envelope. */
async function runWithJobContext<T>(
  database: DatabaseClient,
  job: ClaimedQueueJob,
  callback: () => Promise<T>
): Promise<T> {
  const security = await resolveJobSecurity(database, job);
  const context = createRequestContext({
    requestId: job.envelope.requestId,
    correlationId: job.envelope.correlationId
  });
  return runWithRequestContext(context, async () => {
    bindRequestSecurityContext(security);
    return callback();
  });
}

/** Validate persisted report-run metadata before generation begins. */
function validateReportRun(run: StoredReportRun): Readonly<{
  reportCode: ReportCode;
  outputFormat: ReportOutputFormat;
  filters: ReportFilters;
}> {
  if (!isReportCode(run.reportCode) || !isReportOutputFormat(run.outputFormat)) {
    throw new Error('REPORT_EXPORT_FAILED');
  }
  const filters = reportFiltersSchema.safeParse(run.filtersJson);
  if (!filters.success) throw new Error('REPORT_FILTER_INVALID');
  return { reportCode: run.reportCode, outputFormat: run.outputFormat, filters: filters.data };
}

/** Convert one report value into a compact export cell without exposing executable formulas. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Build a stable column list from the generated rows only. */
function reportColumns(rows: readonly Record<string, unknown>[]): readonly string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) columns.add(key);
  }
  return [...columns].sort();
}

/** Escape one CSV field according to the standard quote-doubling rule. */
function csvField(value: string): string {
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(protectedValue)
    ? `"${protectedValue.replaceAll('"', '""')}"`
    : protectedValue;
}

/** Escape one value before placing it into the simple Excel HTML document. */
function htmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Build common source/as-of metadata required on every generated export. */
function exportMetadata(report: RunReportResponse, filters: ReportFilters): readonly [string, string][] {
  return [
    ['Report Code', report.reportCode],
    ['Generated At', report.generatedAt],
    ['As Of Date', report.asOfDate ?? ''],
    ['Source', 'Approved Final-21 source modules'],
    ['Filters', JSON.stringify(filters)]
  ];
}

/** Render one report as UTF-8 CSV with metadata and formula-safe cells. */
function renderCsv(report: RunReportResponse, filters: ReportFilters): Uint8Array {
  const columns = reportColumns(report.rows);
  const lines = exportMetadata(report, filters).map(([key, value]) => `${csvField(key)},${csvField(value)}`);
  lines.push('');
  if (columns.length > 0) lines.push(columns.map(csvField).join(','));
  for (const row of report.rows) {
    lines.push(columns.map((column) => csvField(cellText(row[column]))).join(','));
  }
  return new TextEncoder().encode(lines.join('\r\n'));
}

/** Render one report as an Excel-readable HTML workbook without adding a spreadsheet dependency. */
function renderExcel(report: RunReportResponse, filters: ReportFilters): Uint8Array {
  const columns = reportColumns(report.rows);
  const metadataRows = exportMetadata(report, filters)
    .map(([key, value]) => `<tr><th>${htmlText(key)}</th><td>${htmlText(value)}</td></tr>`)
    .join('');
  const header = columns.map((column) => `<th>${htmlText(column)}</th>`).join('');
  const rows = report.rows.map((row) => `<tr>${columns
    .map((column) => `<td>${htmlText(cellText(row[column]))}</td>`)
    .join('')}</tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${htmlText(report.reportCode)}</title></head><body><table>${metadataRows}</table><br><table border="1"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  return new TextEncoder().encode(html);
}

/** Reduce one Unicode line to PDF-safe printable ASCII and wrap it to a fixed width. */
function pdfLines(value: string): readonly string[] {
  const ascii = value.replace(/[^\x20-\x7E]/g, '?').replaceAll('\t', ' ');
  if (!ascii) return [''];
  const lines: string[] = [];
  for (let start = 0; start < ascii.length; start += PDF_LINE_WIDTH) {
    lines.push(ascii.slice(start, start + PDF_LINE_WIDTH));
  }
  return lines;
}

/** Escape PDF text delimiters used inside one literal text command. */
function pdfText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

/** Render a small dependency-free multi-page PDF for bounded report export rows. */
function renderPdf(report: RunReportResponse, filters: ReportFilters): Uint8Array {
  const columns = reportColumns(report.rows);
  const logicalLines = [
    ...exportMetadata(report, filters).flatMap(([key, value]) => pdfLines(`${key}: ${value}`)),
    '',
    ...pdfLines(columns.join(' | ')),
    ...report.rows.flatMap((row) => pdfLines(columns.map((column) => cellText(row[column])).join(' | ')))
  ];
  const pages: string[][] = [];
  for (let index = 0; index < logicalLines.length; index += PDF_LINES_PER_PAGE) {
    pages.push(logicalLines.slice(index, index + PDF_LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push(['No rows']);

  const pageObjectNumbers = pages.map((_page, index) => 4 + (index * 2));
  const objects = new Map<number, string>();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  pages.forEach((lines, index) => {
    const pageObject = pageObjectNumbers[index] as number;
    const contentObject = pageObject + 1;
    const commands = ['BT', '/F1 8 Tf', '36 756 Td', '11 TL'];
    for (const line of lines) commands.push(`(${pdfText(line)}) Tj`, 'T*');
    commands.push('ET');
    const stream = commands.join('\n');
    objects.set(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.set(contentObject, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  const maxObject = Math.max(...objects.keys());
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    offsets[objectNumber] = pdf.length;
    pdf += `${objectNumber} 0 obj\n${objects.get(objectNumber) ?? '<<>>'}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    pdf += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/** Render one allowed export format and calculate its immutable SHA-256 checksum. */
function renderArtifact(
  runId: string,
  report: RunReportResponse,
  filters: ReportFilters,
  outputFormat: ReportOutputFormat
): ExportArtifact {
  const rendered = outputFormat === 'CSV'
    ? { body: renderCsv(report, filters), extension: 'csv', mimeType: 'text/csv; charset=utf-8' }
    : outputFormat === 'EXCEL'
      ? { body: renderExcel(report, filters), extension: 'xls', mimeType: 'application/vnd.ms-excel' }
      : { body: renderPdf(report, filters), extension: 'pdf', mimeType: 'application/pdf' };
  return {
    body: rendered.body,
    fileName: `${report.reportCode}-${runId}.${rendered.extension}`,
    mimeType: rendered.mimeType,
    checksum: createHash('sha256').update(rendered.body).digest('base64')
  };
}

/** Store one deterministic export object once and safely reuse it after a worker retry. */
async function storeArtifact(storage: ObjectStorage, run: StoredReportRun, artifact: ExportArtifact): Promise<string> {
  const storageKey = buildCompanyObjectKey({ namespace: 'report-exports', objectId: run.id, versionId: run.id });
  try {
    const existing = await storage.headObject(storageKey);
    if (existing.sizeBytes !== artifact.body.byteLength || existing.metadata['report-run-id'] !== run.id) {
      throw new Error('REPORT_EXPORT_OBJECT_CONFLICT');
    }
    return storageKey;
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'STORAGE_OBJECT_NOT_FOUND') throw error;
  }

  await storage.putObject({
    key: storageKey,
    body: artifact.body,
    contentType: artifact.mimeType,
    contentLength: artifact.body.byteLength,
    checksumSha256: artifact.checksum,
    metadata: {
      'report-run-id': run.id,
      'report-code': run.reportCode
    }
  });
  return storageKey;
}

/** Persist Module 21 metadata and complete the report run in one database transaction. */
async function completeReportExport(
  database: DatabaseClient,
  run: StoredReportRun,
  filters: ReportFilters,
  artifact: ExportArtifact,
  storageKey: string
): Promise<void> {
  await withTransaction(database, async (tx: TransactionClient) => {
    const documents = new DocumentsRepository(tx);
    const reports = new ReportsRepository(tx);
    const projectId = filters.projectId ?? null;
    const document = await documents.createDocument({
      id: run.id,
      projectId,
      title: `Report export: ${run.reportCode}`,
      documentNo: null,
      category: 'REPORT_EXPORT',
      status: 'active',
      fileName: artifact.fileName,
      mimeType: artifact.mimeType,
      sizeBytes: BigInt(artifact.body.byteLength),
      createdBy: run.requestedBy
    });
    const version = await documents.createDocumentVersion({
      id: run.id,
      documentId: document.id,
      versionNo: 1,
      storageKey,
      originalName: artifact.fileName,
      mimeType: artifact.mimeType,
      sizeBytes: BigInt(artifact.body.byteLength),
      checksum: artifact.checksum,
      createdBy: run.requestedBy
    });
    if (!version) throw new Error('REPORT_EXPORT_FAILED');
    if (!(await documents.setCurrentVersion(document.id, version.id, artifact.fileName, artifact.mimeType, version.sizeBytes))) {
      throw new Error('REPORT_EXPORT_FAILED');
    }
    if (!(await reports.markReportRunCompleted(run.id, run.requestedBy, document.id, new Date()))) {
      throw new Error('REPORT_EXPORT_FAILED');
    }

    await recordAudit(tx, {
      action: 'document.created',
      entityType: 'document',
      entityId: document.id,
      after: { projectId, category: document.category, fileName: document.fileName, mimeType: document.mimeType }
    });
    await recordAudit(tx, {
      action: 'document.version_added',
      entityType: 'document_version',
      entityId: version.id,
      after: { documentId: document.id, versionNo: version.versionNo, checksum: version.checksum }
    });
    await recordAudit(tx, {
      action: 'report.export_completed',
      entityType: 'report_run',
      entityId: run.id,
      after: { reportCode: run.reportCode, outputFormat: run.outputFormat, fileId: document.id }
    });
    await recordOutboxEvent(tx, {
      eventType: 'document.created',
      resourceType: 'document',
      resourceId: document.id,
      payload: { documentId: document.id, projectId, category: document.category }
    });
    await recordOutboxEvent(tx, {
      eventType: 'document.version_added',
      resourceType: 'document',
      resourceId: document.id,
      payload: { documentId: document.id, projectId, versionId: version.id, versionNo: version.versionNo }
    });
    await recordOutboxEvent(tx, {
      eventType: 'report.export_completed',
      resourceType: 'report_run',
      resourceId: run.id,
      payload: { reportRunId: run.id, reportCode: run.reportCode, fileId: document.id }
    });
  });
}

/** Generate and persist one claimed report export while keeping retries idempotent. */
async function handleJob(database: DatabaseClient, storage: ObjectStorage, job: ClaimedQueueJob): Promise<void> {
  const payload = readJobPayload(job);
  await runWithJobContext(database, job, async () => {
    const repository = new ReportsRepository(database);
    let run = await repository.findReportRunById(payload.runId, job.envelope.actorUserId as string);
    if (!run) throw new Error('REPORT_SCOPE_FORBIDDEN');
    if (run.status === 'COMPLETED' || run.status === 'FAILED') return;
    if (run.status === 'QUEUED') {
      if (!(await repository.markReportRunRunning(run.id, run.requestedBy, new Date()))) {
        throw new Error('REPORT_EXPORT_FAILED');
      }
      run = await repository.findReportRunById(run.id, run.requestedBy);
      if (!run) throw new Error('REPORT_EXPORT_FAILED');
    }
    if (run.status !== 'RUNNING') throw new Error('REPORT_EXPORT_FAILED');

    const validated = validateReportRun(run);
    const report = await new ReportsService(database).runExportData({
      reportCode: validated.reportCode,
      filters: validated.filters
    });
    const artifact = renderArtifact(run.id, report, validated.filters, validated.outputFormat);
    const storageKey = await storeArtifact(storage, run, artifact);
    await completeReportExport(database, run, validated.filters, artifact, storageKey);
  });
  await completeQueueJob(database, { jobId: job.envelope.jobId, workerId: WORKER_ID });
}

/** Convert one worker exception into a stable queue-safe error code. */
function exportErrorCode(error: unknown): string {
  if (error instanceof AppError && /^[A-Z][A-Z0-9_]{1,99}$/.test(error.code)) return error.code;
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{1,99}$/.test(error.message)) return error.message;
  return 'REPORT_EXPORT_FAILED';
}

/** Mark one terminally failed run and emit its audit/outbox evidence inside the queued Company context. */
async function markTerminalFailure(database: DatabaseClient, job: ClaimedQueueJob, errorCode: string): Promise<void> {
  const payload = readJobPayload(job);
  const actorUserId = job.envelope.actorUserId;
  if (!actorUserId) return;
  const context = createRequestContext({ requestId: job.envelope.requestId, correlationId: job.envelope.correlationId });
  await runWithRequestContext(context, async () => {
    bindRequestSecurityContext({
      actorUserId,
      companyId: job.envelope.companyId,
      permissions: [],
      projectScope: job.envelope.projectScope.kind === 'not-resolved'
        ? { kind: 'restricted', projectIds: [] }
        : job.envelope.projectScope
    });
    await withTransaction(database, async (tx) => {
      const repository = new ReportsRepository(tx);
      const changed = await repository.markReportRunFailed(payload.runId, actorUserId, errorCode, new Date());
      if (!changed) return;
      await recordAudit(tx, {
        action: 'report.export_failed',
        entityType: 'report_run',
        entityId: payload.runId,
        after: { errorCode }
      });
      await recordOutboxEvent(tx, {
        eventType: 'report.export_failed',
        resourceType: 'report_run',
        resourceId: payload.runId,
        payload: { reportRunId: payload.runId, errorCode }
      });
    });
  });
}

/** Process one small queue batch and return how many report jobs were claimed. */
async function runBatch(
  database: DatabaseClient,
  storage: ObjectStorage,
  logger: ReturnType<typeof createStructuredLogger>
): Promise<number> {
  const jobs = await claimQueueJobs(database, {
    queueName: REPORT_EXPORT_QUEUE_NAME,
    workerId: WORKER_ID,
    limit: 5,
    leaseSeconds: 300
  });

  for (const job of jobs) {
    try {
      await handleJob(database, storage, job);
    } catch (error) {
      const errorCode = exportErrorCode(error);
      const outcome = await failQueueJob(database, {
        jobId: job.envelope.jobId,
        workerId: WORKER_ID,
        errorCode,
        retryAt: new Date(Date.now() + RETRY_DELAY_MS)
      });
      if (outcome === 'DEAD_LETTERED') {
        await markTerminalFailure(database, job, errorCode).catch(() => undefined);
      }
      logger.error({ jobId: job.envelope.jobId, error: toSafeErrorLog(error) }, 'report-export.job_failed');
    }
  }
  return jobs.length;
}

/** Wait without keeping a busy loop when the export queue has no due work. */
function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Request a graceful worker stop after the current export finishes. */
function requestStop(): void {
  stopping = true;
}

/** Run the durable report export worker until shutdown is requested. */
async function main(): Promise<void> {
  const config = resolveConfig();
  const logger = createStructuredLogger({
    level: config.logLevel,
    service: 'report-export-worker',
    environment: config.nodeEnv
  });
  process.env.DATABASE_URL = config.database.url;
  const database = createDatabaseClient({
    logQueries: config.nodeEnv === 'development' && config.logLevel === 'trace'
  });
  const storage = createS3ObjectStorage(config.storage);

  logger.info('report-export.worker_started');
  try {
    while (!stopping) {
      const claimed = await runBatch(database, storage, logger);
      if (claimed === 0) await wait(POLL_INTERVAL_MS);
    }
  } finally {
    storage.close();
    await disconnectDatabase(database);
    logger.info('report-export.worker_stopped');
  }
}

process.once('SIGTERM', requestStop);
process.once('SIGINT', requestStop);

main().catch((error) => {
  const logger = createStructuredLogger({
    level: 'error',
    service: 'report-export-worker',
    environment: 'startup'
  });
  logger.error({ error: toSafeErrorLog(error) }, 'report-export.worker_failed');
  process.exitCode = 1;
});
