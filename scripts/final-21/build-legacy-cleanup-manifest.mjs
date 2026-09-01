import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OUTPUT = 'docs/final-21-legacy-cleanup-manifest.md';

const FULL_DELETE_MODULES = [
  'approvals',
  'tendering-estimation',
  'boq',
  'wbs-cost-codes',
  'scheduling',
  'change-orders',
  'rfi-submittals'
];

const MIXED_MODULES = [
  'clients',
  'procurement',
  'purchase-orders',
  'subcontracts',
  'projects',
  'budgets-job-cost',
  'hr-payroll',
  'workforce-timesheets',
  'client-billing'
];

const LEGACY_MODEL_NAMES = [
  'ApprovalDefinition', 'ApprovalStep', 'ApprovalRequest', 'ApprovalAction', 'ApprovalDelegation',
  'Opportunity', 'OpportunityNote',
  'Tender', 'EstimateVersion', 'EstimateItem', 'TenderSubmission',
  'Boq', 'BoqRevision', 'BoqItem',
  'ProjectCostStructureState', 'WbsNode', 'CostCode', 'CostType', 'ProjectCostCode',
  'Rfq', 'RfqItem', 'RfqVendor', 'SupplierQuotation', 'SupplierQuotationItem',
  'ProjectSchedule', 'ScheduleActivity', 'ScheduleDependency', 'ScheduleBaseline', 'ScheduleProgressUpdate',
  'ChangeRequest', 'ChangeRequestLine', 'ChangeOrder', 'ChangeOrderImpact',
  'ClientContract',
  'Submittal', 'SubmittalRevision', 'SubmittalReview', 'Rfi', 'RfiResponse'
];

const MIXED_SYMBOL_RULES = {
  clients: [
    { pattern: /opportunit/i, action: 'DELETE', destination: 'Excluded CRM opportunity pipeline' },
    { pattern: /client|contact|permission|page|archive/i, action: 'KEEP', destination: 'Final Module 4 Client Management' }
  ],
  procurement: [
    { pattern: /rfq|quotation/i, action: 'DELETE', destination: 'Excluded RFQ / quotation flow' },
    { pattern: /vendor|supplier/i, action: 'MOVE', destination: 'Final Module 5 Supplier & Subcontractor Management' },
    { pattern: /requisition|project|permission|money|date|result|fraction/i, action: 'KEEP', destination: 'Final Module 10 Procurement / Purchase after refactor' },
    { pattern: /costStructure|wbs|costCode|costType/i, action: 'DELETE', destination: 'Replace with project/stage cost category' }
  ],
  'purchase-orders': [
    { pattern: /.*/, action: 'MOVE', destination: 'Final Module 10 Procurement / Purchase' }
  ],
  subcontracts: [
    { pattern: /subcontractorResponse|listSubcontractors|createSubcontractor|findSubcontractorById|findVendorById/i, action: 'MOVE', destination: 'Final Module 5 Supplier & Subcontractor Management' },
    { pattern: /.*/, action: 'DELETE', destination: 'Standalone subcontract contract/payment workflow is outside final scope' }
  ],
  projects: [
    { pattern: /tender/i, action: 'DELETE', destination: 'Project must be created directly from Client' },
    { pattern: /member/i, action: 'MOVE', destination: 'Final Module 8 Project Team / Assignment' },
    { pattern: /resume/i, action: 'DELETE', destination: 'Not part of the final documented Project command API' },
    { pattern: /.*/, action: 'KEEP', destination: 'Final Module 6 Project Management, with commercial-model refactor' }
  ],
  'budgets-job-cost': [
    { pattern: /costStructure|wbs|costCode|costType|postingCostStructure/i, action: 'DELETE', destination: 'Replace with project/stage simple cost categories' },
    { pattern: /.*/, action: 'KEEP', destination: 'Final Module 9 Project Budget & Cost Tracking, with schema refactor' }
  ],
  'hr-payroll': [
    { pattern: /leave/i, action: 'DELETE', destination: 'Leave management is outside the final 21-module contract' },
    { pattern: /employee|compensation/i, action: 'MOVE', destination: 'Final Module 3 Employee & Labour Management' },
    { pattern: /payroll|payslip|calculation|sourceConsumption/i, action: 'MOVE', destination: 'Final Module 13 Labour / Attendance & Payroll' },
    { pattern: /.*/, action: 'MOVE', destination: 'Split between final Modules 3 and 13 after review' }
  ],
  'workforce-timesheets': [
    { pattern: /assignment/i, action: 'MOVE', destination: 'Final Module 8 Project Team / Assignment' },
    { pattern: /timesheet/i, action: 'DELETE', destination: 'Replace timesheet workflow with final attendance_entries workflow' },
    { pattern: /.*/, action: 'MOVE', destination: 'Reuse only validation that fits final assignment/attendance modules' }
  ],
  'client-billing': [
    { pattern: /contract/i, action: 'DELETE', destination: 'Standalone Client Contract ownership is excluded' },
    { pattern: /claim|invoice|retention|billing|money|date|project/i, action: 'MOVE', destination: 'Final Module 15 Client Billing, rewritten around project billing settings and stage lines' },
    { pattern: /.*/, action: 'MOVE', destination: 'Final Module 15 Client Billing after contract/BOQ decoupling' }
  ]
};

const LEGACY_REFERENCE_PATTERNS = [
  ['Approvals', /approvals|ApprovalRequest|ApprovalDefinition|approval-timing/gi],
  ['Tender / Estimate', /tender|estimate/gi],
  ['BOQ', /\bboq\b|Boq/gi],
  ['WBS / Cost Code', /wbs|costCode|costType|ProjectCostStructure/gi],
  ['RFQ / Quotation', /\brfq\b|quotation/gi],
  ['Scheduling', /schedule|scheduling/gi],
  ['Change Orders', /changeOrder|changeRequest|change-orders/gi],
  ['RFI / Submittals', /\brfi\b|submittal/gi],
  ['CRM Opportunities', /opportunit/gi],
  ['Client Contract', /ClientContract|client_contract|client-contract/gi]
];

/** Return every file below one directory in stable path order. */
async function walkFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolute));
    if (entry.isFile()) files.push(absolute);
  }
  return files.sort();
}

/** Read one UTF-8 source file. */
async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

/** Return a repository-relative path using forward slashes. */
function relativePath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

/** Extract named function declarations, class methods, and function-valued constants. */
function extractNamedFunctions(source) {
  const names = [];
  const patterns = [
    /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    /^\s{2,}(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^;\n]*\)\s*(?::[^\n{]+)?\s*\{/gm,
    /^\s*(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(/gm
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) names.push(match[1]);
  }
  return [...new Set(names)].filter((name) => !['if', 'for', 'while', 'switch', 'catch'].includes(name));
}

/** Extract Fastify route method/path pairs from one route source file. */
function extractRoutes(source) {
  const routes = [];
  const pattern = /app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)/gi;
  for (const match of source.matchAll(pattern)) routes.push(`${match[1].toUpperCase()} ${match[2]}`);
  return routes;
}

/** Classify one named symbol in a mixed legacy/final module. */
function classifyMixedSymbol(moduleName, symbolName) {
  const rules = MIXED_SYMBOL_RULES[moduleName] ?? [];
  for (const rule of rules) {
    if (rule.pattern.test(symbolName)) return { action: rule.action, destination: rule.destination };
  }
  return { action: 'KEEP', destination: 'Review in owning final module' };
}

/** Extract all Prisma model blocks from the centralized schema. */
function extractPrismaModels(source) {
  const models = new Map();
  const pattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const match of source.matchAll(pattern)) models.set(match[1], match[2]);
  return models;
}

/** Return non-legacy Prisma models that still reference a legacy-owned model or field family. */
function findPrismaCrossReferences(models) {
  const references = [];
  for (const [name, body] of models) {
    if (LEGACY_MODEL_NAMES.includes(name)) continue;
    const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
    const matchingLines = lines.filter((line) => LEGACY_MODEL_NAMES.some((legacyName) => line.includes(legacyName))
      || /\b(tenderId|wbsNodeId|costCodeId|costTypeId|quotationId|contractId|boqItemId)\b/.test(line));
    if (matchingLines.length > 0) references.push({ name, lines: matchingLines });
  }
  return references;
}

/** Return source/test files that mention legacy concepts outside full-delete module folders. */
async function findCrossCuttingReferences() {
  const roots = ['apps', 'packages', 'tests', 'scripts'];
  const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.prisma']);
  const results = new Map(LEGACY_REFERENCE_PATTERNS.map(([label]) => [label, []]));
  for (const rootName of roots) {
    const rootPath = path.join(ROOT, rootName);
    try {
      if (!(await stat(rootPath)).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const filePath of await walkFiles(rootPath)) {
      const relative = relativePath(filePath);
      if (relative.includes('/dist/') || relative.includes('/node_modules/') || relative.includes('-evidence/')) continue;
      if (!allowedExtensions.has(path.extname(filePath)) && !relative.endsWith('schema.prisma')) continue;
      const source = await readText(filePath);
      for (const [label, pattern] of LEGACY_REFERENCE_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(source)) results.get(label).push(relative);
      }
    }
  }
  return results;
}

/** Render one full-delete module section with files, routes, and named symbols. */
async function renderFullDeleteModule(moduleName) {
  const apiDir = path.join(ROOT, 'apps/api/src/modules', moduleName);
  const webDir = path.join(ROOT, 'apps/web/src/features', moduleName);
  const apiFiles = await walkFiles(apiDir);
  const webFiles = await walkFiles(webDir);
  const files = [...apiFiles, ...webFiles];
  const routeFile = files.find((file) => file.endsWith('.routes.ts'));
  const routes = routeFile ? extractRoutes(await readText(routeFile)) : [];
  const functionRows = [];
  for (const file of files.filter((item) => item.endsWith('.ts') || item.endsWith('.tsx'))) {
    const functions = extractNamedFunctions(await readText(file));
    for (const name of functions) functionRows.push(`- DELETE \`${relativePath(file)} :: ${name}\``);
  }
  return [
    `### ${moduleName}`,
    '',
    `Decision: **DELETE** the standalone module after downstream dependencies are removed. Current state: backend ${apiFiles.length > 0 ? 'present' : 'removed'}, frontend ${webFiles.length > 0 ? 'present' : 'removed'}.`,
    '',
    '**Files**',
    ...files.map((file) => `- DELETE \`${relativePath(file)}\``),
    '',
    '**Current routes**',
    ...(routes.length > 0 ? routes.map((route) => `- DELETE \`${route}\``) : ['- None found']),
    '',
    '**Named functions/components**',
    ...(functionRows.length > 0 ? functionRows : ['- None found']),
    ''
  ].join('\n');
}

/** Render the Pass B6 Project Management section after legacy member ownership is removed. */
async function renderProjectModule() {
  return [
    '### projects',
    '',
    'Decision: **ALIGNED FOR FINAL MODULE 6 AFTER PASS B6**. Project Management now owns only Project master/commercial/lifecycle behavior. Project team/member mutation has been removed from the active Project API, service, repository and React feature.',
    '',
    '**Active Final Module 6 files**',
    '- KEEP `apps/api/src/modules/projects/index.ts`',
    '- KEEP `apps/api/src/modules/projects/projects.repository.ts`',
    '- KEEP `apps/api/src/modules/projects/projects.routes.ts`',
    '- KEEP `apps/api/src/modules/projects/projects.schema.ts`',
    '- KEEP `apps/api/src/modules/projects/projects.service.ts`',
    '- KEEP `apps/web/src/features/projects/api/projects-api.ts`',
    '- KEEP `apps/web/src/features/projects/components/project-details-panel.tsx`',
    '- KEEP `apps/web/src/features/projects/hooks/projects.ts`',
    '- KEEP `apps/web/src/features/projects/pages/projects-page.tsx`',
    '',
    '**Active routes**',
    '- KEEP `GET /api/v1/projects`',
    '- KEEP `POST /api/v1/projects`',
    '- KEEP `GET /api/v1/projects/:id`',
    '- KEEP `PATCH /api/v1/projects/:id`',
    '- KEEP `POST /api/v1/projects/:id/activate`',
    '- KEEP `POST /api/v1/projects/:id/suspend`',
    '- KEEP `POST /api/v1/projects/:id/complete`',
    '- KEEP `POST /api/v1/projects/:id/close`',
    '- REMOVED `PUT /api/v1/projects/:id/members` → employee Project/stage assignments belong to Final Module 8.',
    '',
    '**Pass B6 ownership cleanup**',
    '- REMOVED `projects.manage_members` from the active Project permission contract and mark it as a removed legacy permission in Administration.',
    '- REMOVED Project member request/response schemas, repository functions, service transaction/audit/outbox logic, route serializers and React member editor.',
    '- Project detail now returns only Project master + lifecycle history.',
    '- ADDED distinct `projects.complete` authority; suspend uses `projects.update`, complete uses `projects.complete`, and close uses `projects.close`.',
    '- B8 MIGRATED useful `project_members` rows that resolve to a same-company Employee into `project_team_assignments`, then removed the legacy table/model through a forward migration.',
    '- REMOVED obsolete Module-24B runtime verification scripts/tests/package commands because that superseded membership API no longer exists. Historical migrations remain untouched.',
    ''
  ].join('\n');
}

/** Render one mixed module section with function-level KEEP/MOVE/DELETE decisions. */
async function renderMixedModule(moduleName) {
  if (moduleName === 'projects') return renderProjectModule();
  const apiDir = path.join(ROOT, 'apps/api/src/modules', moduleName);
  const webDir = path.join(ROOT, 'apps/web/src/features', moduleName);
  const files = [...await walkFiles(apiDir), ...await walkFiles(webDir)];
  const routeFile = files.find((file) => file.endsWith('.routes.ts'));
  const routes = routeFile ? extractRoutes(await readText(routeFile)) : [];
  const rows = [];
  for (const file of files.filter((item) => item.endsWith('.ts') || item.endsWith('.tsx'))) {
    for (const symbol of extractNamedFunctions(await readText(file))) {
      const decision = classifyMixedSymbol(moduleName, symbol);
      rows.push(`- ${decision.action} \`${relativePath(file)} :: ${symbol}\` → ${decision.destination}`);
    }
  }
  return [
    `### ${moduleName}`,
    '',
    'Decision: **MIXED**. Keep only final-scope behavior; move reusable logic to its final owner and delete obsolete workflow logic in later passes.',
    '',
    '**Files requiring split/refactor review**',
    ...files.map((file) => `- REVIEW \`${relativePath(file)}\``),
    '',
    '**Current routes to reconcile**',
    ...(routes.length > 0 ? routes.map((route) => `- REVIEW \`${route}\``) : ['- None found']),
    '',
    '**Named function/component decisions**',
    ...(rows.length > 0 ? rows : ['- None found']),
    ''
  ].join('\n');
}

/** Build the complete deterministic Final-21 cleanup inventory. */
async function buildManifest() {
  const prismaSource = await readText(path.join(ROOT, 'packages/database/prisma/schema.prisma'));
  const models = extractPrismaModels(prismaSource);
  const crossModelRefs = findPrismaCrossReferences(models);
  const crossCuttingRefs = await findCrossCuttingReferences();
  const deleteSections = [];
  const mixedSections = [];

  for (const moduleName of FULL_DELETE_MODULES) deleteSections.push(await renderFullDeleteModule(moduleName));
  for (const moduleName of MIXED_MODULES) mixedSections.push(await renderMixedModule(moduleName));

  const legacyModelsPresent = LEGACY_MODEL_NAMES.filter((name) => models.has(name));
  const crossRefSection = [...crossCuttingRefs.entries()].map(([label, files]) => [
    `### ${label}`,
    ...[...new Set(files)].sort().map((file) => `- REVIEW \`${file}\``),
    ''
  ].join('\n')).join('\n');

  return `# Final 21-Module Legacy Cleanup Manifest\n\n` +
`Generated from the current repository by \`scripts/final-21/build-legacy-cleanup-manifest.mjs\`.\n\n` +
`## Inventory rules\n\n` +
`- This manifest reports the current repository state. Cleanup passes may delete obsolete source files, but historical migrations remain immutable.\n` +
`- The Final 21-Module Merged Requirements are controlling. CRM opportunities, Tender/Estimate/Proposal, standalone Contract, BOQ, WBS/Cost Codes, RFQ, standalone Approval Workflows, Change Orders, RFI/Submittals, and Project Scheduling are excluded as standalone business modules.\n` +
`- Minimal status approval, stage dates/progress evidence, documents, and controlled commands remain owned by their final modules.\n` +
`- Historical migrations stay immutable; obsolete tables are removed only through later forward migrations after replacement data paths exist.\n\n` +
`## Decision legend\n\n` +
`- **DELETE**: obsolete final-scope behavior; remove only after its consumers are disconnected.\n` +
`- **MOVE**: reusable logic belongs in another final module. Move first, prove the replacement, then delete the old copy.\n` +
`- **KEEP**: behavior belongs to the final owner, although fields/routes may still need contract refactoring.\n` +
`- **REVIEW**: file contains mixed concerns or a cross-cutting dependency that must be handled before deletion.\n\n` +
`## High-level removal order\n\n` +
`1. Disconnect Approval service consumers and replace each with module-owned status commands.\n` +
`2. Remove CRM Opportunity, Tender/Estimate, BOQ, WBS/Cost Code, RFQ/Quotation, Scheduling, Change Order, and RFI/Submittal code paths.\n` +
`3. Move vendor/subcontractor master behavior to Final Module 5.\n` +
`4. Move Purchase Order behavior into Final Module 10 Procurement / Purchase.\n` +
`5. Split employee master from payroll, and project assignments from timesheets.\n` +
`6. Remove Project tender/member coupling, Budget WBS coupling, and Client Billing contract/BOQ coupling.\n` +
`7. Only after replacements are proven, create forward migrations that remove obsolete tables/relations.\n\n` +
`## A. Standalone modules marked DELETE\n\n${deleteSections.join('\n')}\n` +
`## B. Mixed modules requiring MOVE / KEEP / DELETE split\n\n${mixedSections.join('\n')}\n` +
`## C. Prisma legacy model inventory\n\n` +
`The following legacy-owned models currently exist and are marked **DELETE through a future forward migration**, not in Pass A1:\n\n` +
legacyModelsPresent.map((name) => `- DELETE \`${name}\``).join('\n') + '\n\n' +
`### Non-legacy models that still reference legacy models/fields\n\n` +
crossModelRefs.map(({ name, lines }) => `- REVIEW \`${name}\`\n${lines.map((line) => `  - \`${line.replace(/`/g, '\\`')}\``).join('\n')}`).join('\n') + '\n\n' +
`## D. Cross-cutting source/test dependency map\n\n` +
`These files mention each legacy concept and must be reviewed before deleting the owning module. Historical migration files are intentionally not listed for deletion.\n\n${crossRefSection}\n` +
`## E. Inventory coverage\n\n` +
`- [x] Full-delete backend/frontend modules inventoried.\n` +
`- [x] Current routes inventoried.\n` +
`- [x] Named functions/components inventoried and marked DELETE/MOVE/KEEP for mixed modules.\n` +
`- [x] Legacy Prisma models inventoried.\n` +
`- [x] Non-legacy Prisma relations that still point at legacy models/fields inventoried.\n` +
`- [x] Cross-cutting source/tests mentioning legacy concepts inventoried.\n` +
`- [x] No production business logic removed in Pass A1.\n` +
`- [x] No historical migration removed or rewritten in Pass A1.\n`;
}

/** Generate the manifest or verify that the checked-in copy is current. */
async function main() {
  const manifest = await buildManifest();
  if (process.argv.includes('--check')) {
    const current = await readText(path.join(ROOT, OUTPUT));
    if (current !== manifest) throw new Error(`${OUTPUT} is stale. Run pnpm final-21:legacy-inventory.`);
    console.log(`Legacy cleanup manifest is current: ${OUTPUT}`);
    return;
  }
  await writeFile(path.join(ROOT, OUTPUT), manifest, 'utf8');
  console.log(`Wrote ${OUTPUT}`);
}

await main();
