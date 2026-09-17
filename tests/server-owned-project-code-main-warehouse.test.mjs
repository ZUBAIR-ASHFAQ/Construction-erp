import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Project creation keeps project code server-owned end to end', async () => {
  const schema = await read('apps/api/src/modules/projects/projects.schema.ts');
  const routes = await read('apps/api/src/modules/projects/projects.routes.ts');
  const repository = await read('apps/api/src/modules/projects/projects.repository.ts');
  const service = await read('apps/api/src/modules/projects/projects.service.ts');
  const api = await read('apps/web/src/features/projects/api/projects-api.ts');
  const page = await read('apps/web/src/features/projects/pages/projects-page.tsx');

  const createSchema = schema.slice(schema.indexOf('export const createProjectBodySchema'), schema.indexOf('/** Update only normal editable'));
  const createInput = api.slice(api.indexOf('export type CreateProjectInput'), api.indexOf('export type UpdateProjectInput'));
  const postRoute = routes.slice(routes.indexOf("app.post('/api/v1/projects'"), routes.indexOf("app.get('/api/v1/projects/:id'"));

  assert.match(schema, /PROJECT_SERVER_OWNED_REQUEST_FIELDS[\s\S]*'projectCode'/);
  assert.doesNotMatch(createSchema, /projectCode\s*:/);
  assert.doesNotMatch(createInput, /projectCode\s*:/);
  assert.doesNotMatch(postRoute, /'projectCode'/);
  assert.doesNotMatch(page, /register\('projectCode'\)/);
  assert.match(repository, /sequenceKey: 'project'[\s\S]*prefix: 'PRJ-'/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: PROJECT_SEQUENCE_KEY \}\)/);
  assert.match(service, /projectCode,\n\s*name: input\.name/);
});

test('Goods Receipt defaults to Main Warehouse without a browser warehouse selector', async () => {
  const schema = await read('apps/api/src/modules/procurement/procurement.schema.ts');
  const routes = await read('apps/api/src/modules/procurement/procurement.routes.ts');
  const service = await read('apps/api/src/modules/procurement/procurement.service.ts');
  const api = await read('apps/web/src/features/procurement/api/procurement-api.ts');
  const workspace = await read('apps/web/src/features/procurement/components/procurement-workspace.tsx');
  const inventoryRepository = await read('apps/api/src/modules/inventory/inventory.repository.ts');
  const inventoryService = await read('apps/api/src/modules/inventory/inventory.service.ts');

  const body = schema.slice(schema.indexOf('export const createGoodsReceiptBodySchema'), schema.indexOf('export const goodsReceiptItemResponseSchema'));
  const input = api.slice(api.indexOf('export type CreateGoodsReceiptInput'), api.indexOf('export type GoodsReceiptItem'));
  const jsonBody = routes.slice(routes.indexOf('const GOODS_RECEIPT_BODY_JSON_SCHEMA'), routes.indexOf('const EMPTY_BODY_JSON_SCHEMA'));

  assert.match(body, /warehouseId: uuidSchema\.optional\(\)/);
  assert.doesNotMatch(input, /warehouseId\s*:/);
  assert.doesNotMatch(jsonBody.match(/required: \[[^\]]*\]/)?.[0] ?? '', /warehouseId/);
  assert.doesNotMatch(workspace, /register\('warehouseId'\)/);
  assert.match(workspace, /MAIN · Main Warehouse/);
  assert.match(service, /\.\.\.\(input\.warehouseId \? \{ warehouseId: input\.warehouseId \} : \{\}\)/);
  assert.match(inventoryRepository, /ensureMainWarehouse\(\)/);
  assert.match(inventoryService, /input\.warehouseId[\s\S]*repository\.ensureMainWarehouse\(\)/);
});

test('Direct stock entry defaults to Main Warehouse and restricted stock reads stay Project-safe', async () => {
  const schema = await read('apps/api/src/modules/inventory/inventory.schema.ts');
  const routes = await read('apps/api/src/modules/inventory/inventory.routes.ts');
  const repository = await read('apps/api/src/modules/inventory/inventory.repository.ts');
  const service = await read('apps/api/src/modules/inventory/inventory.service.ts');
  const api = await read('apps/web/src/features/inventory/api/inventory-api.ts');
  const workspace = await read('apps/web/src/features/inventory/components/inventory-workspace.tsx');

  const body = schema.slice(schema.indexOf('export const adjustStockBodySchema'), schema.indexOf('/** Internal Procurement-to-Inventory'));
  const input = api.slice(api.indexOf('export type AdjustStockInput'), api.indexOf('/** Build one bounded Inventory query string.'));
  const routeBody = routes.slice(routes.indexOf('const ADJUSTMENT_BODY_JSON_SCHEMA'), routes.indexOf('const SUCCESS_JSON_SCHEMA'));

  assert.match(body, /warehouseId: uuid\.optional\(\)/);
  assert.doesNotMatch(input, /warehouseId\s*:/);
  assert.doesNotMatch(routeBody.match(/required: \[[^\]]*\]/)?.[0] ?? '', /warehouseId/);
  assert.doesNotMatch(workspace, /directWarehouseId/);
  assert.match(workspace, /MAIN · Main Warehouse/);
  assert.match(repository, /projectId: null, code: MAIN_WAREHOUSE_CODE/);
  assert.match(repository, /input\.visibility\.allowedProjectIds === null[\s\S]*projectId: \{ in: \[\.\.\.new Set\(input\.visibility\.allowedProjectIds\)\] \}/);
  assert.match(service, /repository\.ensureMainWarehouse\(\)/);
  assert.match(service, /MAIN_WAREHOUSE_CODE && projectId/);
});
