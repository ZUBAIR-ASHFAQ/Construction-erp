import { access, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = process.cwd();
const installerDir = path.dirname(fileURLToPath(import.meta.url));
const numberingTypesPath = path.join(cwd, 'packages/numbering/src/types.ts');
const bootstrapPath = path.join(cwd, 'bootstrap.initial.json');
const procurementServicePath = path.join(cwd, 'apps/api/src/modules/procurement/procurement.service.ts');
const prismaSchemaPath = path.join(cwd, 'packages/database/prisma/schema.prisma');
const sqlPath = path.join(installerDir, 'procurement-requisition-sequence-repair-v2.sql');

/** Return source text with the required Procurement sequence key added exactly once. */
function withRequiredSequenceKey(source) {
  if (/FOUNDATION_REQUIRED_SEQUENCE_KEYS[\s\S]*?'purchase-requisition'/.test(source)) return source;
  const anchor = "  'project',\n  'purchase-order',";
  if (!source.includes(anchor)) throw new Error('Could not locate the Foundation required-sequence list.');
  return source.replace(anchor, "  'project',\n  'purchase-requisition',\n  'purchase-order',");
}

/** Return bootstrap JSON text with a purchase-requisition definition added exactly once. */
function withBootstrapSequence(source) {
  if (/"sequenceKey"\s*:\s*"purchase-requisition"/.test(source)) return source;
  const purchaseOrderMatch = /(^[ \t]*)\{\r?\n(^[ \t]*)"sequenceKey"(\s*:\s*)"purchase-order"/m.exec(source);
  if (!purchaseOrderMatch) throw new Error('Could not locate purchase-order in bootstrap.initial.json.');

  const objectIndent = purchaseOrderMatch[1];
  const keyIndent = purchaseOrderMatch[2];
  const separator = purchaseOrderMatch[3];
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const insertion = `${objectIndent}{${newline}${keyIndent}"sequenceKey"${separator}"purchase-requisition",${newline}${keyIndent}"prefix"${separator}"PR-",${newline}${keyIndent}"padWidth"${separator}4${newline}${objectIndent}},${newline}`;
  return source.slice(0, purchaseOrderMatch.index) + insertion + source.slice(purchaseOrderMatch.index);
}

/** Verify the current repository still uses the expected Procurement number-sequence contract. */
async function prepareSourceChanges() {
  for (const required of ['package.json', numberingTypesPath, bootstrapPath, procurementServicePath, prismaSchemaPath, sqlPath]) {
    await access(required);
  }

  const procurementService = await readFile(procurementServicePath, 'utf8');
  if (!/const REQUISITION_SEQUENCE_KEY = 'purchase-requisition';/.test(procurementService)) {
    throw new Error('Procurement no longer uses the expected purchase-requisition sequence key; no changes were made.');
  }

  const numberingBefore = await readFile(numberingTypesPath, 'utf8');
  const bootstrapBefore = await readFile(bootstrapPath, 'utf8');
  return {
    numberingBefore,
    bootstrapBefore,
    numberingAfter: withRequiredSequenceKey(numberingBefore),
    bootstrapAfter: withBootstrapSequence(bootstrapBefore)
  };
}

/** Apply the idempotent current-database sequence repair through the workspace Prisma CLI. */
function repairCurrentDatabase() {
  if (process.env.PROCUREMENT_SEQUENCE_REPAIR_SKIP_DB === '1') return;
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(pnpm, [
    '--filter', '@construction-erp/database',
    'exec', 'prisma', 'db', 'execute',
    '--schema', prismaSchemaPath,
    '--file', sqlPath
  ], {
    cwd,
    stdio: 'inherit',
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('Database sequence repair failed. Existing source and migration history were left unchanged.');
  }
}

/** Persist only the future-bootstrap source changes after the database repair succeeds. */
async function writeSourceChanges(changes) {
  if (changes.numberingAfter !== changes.numberingBefore) {
    await writeFile(numberingTypesPath, changes.numberingAfter, 'utf8');
  }
  if (changes.bootstrapAfter !== changes.bootstrapBefore) {
    await writeFile(bootstrapPath, changes.bootstrapAfter, 'utf8');
  }
}

try {
  const changes = await prepareSourceChanges();
  repairCurrentDatabase();
  await writeSourceChanges(changes);
  console.log('Procurement purchase-requisition sequence repaired successfully without changing migration history.');
} catch (error) {
  console.error(`Procurement requisition sequence repair failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
