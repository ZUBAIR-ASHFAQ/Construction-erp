import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const evidencePath = path.resolve('module-8-evidence', 'stage-13-react.json');

/** Read one JSON evidence file and return null when that evidence is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage12 = await readJson('module-7-evidence/stage-12-live.json');
const stage12LiveAccepted = stage12?.status === STAGE_12_ACCEPTED
  && stage12?.runtimeVerificationComplete === true;

const integrationEvidence = await readJson('module-8-evidence/stage-13-integration-security.json');
const integrationPrepared = integrationEvidence?.pass === 229
  && [
    'STAGE_13_MODULE_8_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_230',
    'STAGE_13_MODULE_8_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN',
    'STAGE_13_MODULE_8_INTEGRATION_SECURITY_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

const results = [{
  name: 'module-8-integration-security-evidence',
  status: integrationPrepared ? 'passed' : 'failed',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  code: integrationPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-8-integration-security-regression', 'npm', ['run', 'module-8:integration-security:gate']],
  ['module-8-react-static-suite', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  ['module-8-web-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/procurement/api/procurement-api.ts']],
  ['module-8-web-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/procurement/hooks/procurement.ts']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

if (integrationPrepared) {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = integrationPrepared
  && results.length === steps.length + 1
  && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage12LiveAccepted
      ? 'STAGE_13_MODULE_8_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_13_MODULE_8_REACT_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-13-module-8-react-evidence',
  generatedAt: new Date().toISOString(),
  pass: 230,
  stage: 13,
  module: '8 - Procurement & RFQ',
  status,
  stage12LiveAccepted,
  reactCoverage: [
    'typed browser API for exactly the eight reviewed Procurement operations',
    'TanStack Query requisition register and RFQ comparison reads plus reviewed procurement mutations',
    'React Hook Form plus Zod for requisition, RFQ, Vendor invitation, supplier quotation and selection rationale inputs',
    'Project selector reuses the existing Project register while Project authorization stays server-authoritative',
    'requisition editor reuses active posting-enabled Module-6 Project cost structures without creating a new lookup API',
    'RFQ builder keeps server numbering, buyer identity and lifecycle state out of browser authority',
    'Vendor invitation accepts explicit Vendor UUIDs because the reviewed contract has no Vendor list or CRUD route',
    'quotation entry plus local JSON line import calls only the reviewed quotation-recording API and sends no totals',
    'side-by-side quotation comparison exposes stored facts only and adds no FX, scoring or ranking engine',
    'quotation selection accepts optional rationale and explicitly creates no financial commitment'
  ],
  intentionallyAbsent: [
    'No Vendor list/create/update/contact UI is added because the reviewed API defines no Vendor-master endpoints.',
    'No RFQ register/detail API or page is invented; a newly created RFQ remains active only for the current browser workflow.',
    'No separate RFQ-item CRUD/read route is added; the existing RFQ response supplies the real RFQ line identities used by quotation entry.',
    'No Purchase Order conversion, commitment write, Finance posting or payable action is added.',
    'Exact Project-level Module-8 write permission lists are not exposed by /auth/me, so sensitive actions stay hidden unless the corresponding Company permission is visible.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newReactFiles: 4,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 231 - Module 8 Playwright Procurement & RFQ workflow verification.'
    : 'Repair the failed Pass-230 React check before adding Stage-13 Playwright coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 8 Stage-13 React evidence written to ${written}`);

if (!passed) process.exitCode = 1;
