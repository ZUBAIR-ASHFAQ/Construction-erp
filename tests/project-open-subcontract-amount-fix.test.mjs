import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const subcontractRepository = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.repository.ts', 'utf8');
const projectRepository = await readFile('apps/api/src/modules/projects/projects.repository.ts', 'utf8');
const projectService = await readFile('apps/api/src/modules/projects/projects.service.ts', 'utf8');
const projectSchema = await readFile('apps/api/src/modules/projects/projects.schema.ts', 'utf8');
const projectRoutes = await readFile('apps/api/src/modules/projects/projects.routes.ts', 'utf8');
const projectWebApi = await readFile('apps/web/src/features/projects/api/projects-api.ts', 'utf8');
const projectDetails = await readFile('apps/web/src/features/projects/components/project-details-panel.tsx', 'utf8');

test('Project Open detail exposes the selected Project subcontract contract amount end to end', () => {
  assert.match(subcontractRepository, /async readProjectSubcontractSummary\(projectId: string\)/);
  assert.match(subcontractRepository, /subcontractContract\.aggregate\([\s\S]*projectId[\s\S]*contractAmount/);

  assert.match(projectService, /canReadSubcontractors/);
  assert.match(projectService, /readProjectSubcontractSummary\(projectId\)/);
  assert.match(projectService, /subcontractSummary:/);
  assert.match(projectService, /contractAmount:/);
  assert.match(projectRepository, /async sumSubcontractPaymentActuals\(projectId: string\)/);
  assert.match(projectRepository, /category: 'subcontract', sourceType: 'subcontract_payment'/);
  assert.match(projectService, /\(canReadCost \|\| canReadSubcontractors\) \? new VendorsSubcontractorsRepository/);
  assert.match(projectService, /subcontractCostUplift = subcontractContractAmount > subcontractPaymentActualCost/);
  assert.match(projectService, /totalExpense = sourceActualCost \+ supplierCostUplift \+ subcontractCostUplift/);
  assert.match(projectService, /category === 'subcontract'[\s\S]*adjustedSubcontractCost/);
  assert.match(projectService, /subcontractSummary: !canReadSubcontractors \|\| subcontractSummary === null \? null/);

  assert.match(projectSchema, /subcontractSummary: z\.object\([\s\S]*contractCount:[\s\S]*contractAmount:/);
  assert.match(projectRoutes, /'subcontractSummary'/);
  assert.match(projectRoutes, /subcontractSummary: result\.subcontractSummary/);

  assert.match(projectWebApi, /subcontractSummary: Readonly<[\s\S]*contractCount: number;[\s\S]*contractAmount: string;/);
  assert.match(projectDetails, /<dt>Subcontractor contract amount<\/dt>/);
  assert.match(projectDetails, /details\.subcontractSummary\.contractAmount/);
  assert.match(projectDetails, /Includes the agreed subcontract contract amount without counting posted subcontract payments twice/);
});
