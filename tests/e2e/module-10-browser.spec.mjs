import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass253-module10-browser-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000025300';
const CLIENT_ID = '00000000-0000-4000-8000-000000025301';
const PROJECT_ID = '00000000-0000-4000-8000-000000025302';
const WBS_ID = '00000000-0000-4000-8000-000000025303';
const COST_CODE_ID = '00000000-0000-4000-8000-000000025304';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000025305';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000025306';
const MANAGER_ID = '00000000-0000-4000-8000-000000025310';
const READER_ID = '00000000-0000-4000-8000-000000025311';
const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000025320';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000025321';
const ITEM_ID = '00000000-0000-4000-8000-000000025330';
const PROJECT_WAREHOUSE_ID = '00000000-0000-4000-8000-000000025340';
const CENTRAL_WAREHOUSE_ID = '00000000-0000-4000-8000-000000025341';
const VENDOR_ID = '00000000-0000-4000-8000-000000025350';
const PURCHASE_ORDER_ID = '00000000-0000-4000-8000-000000025360';
const PURCHASE_ORDER_ITEM_ID = '00000000-0000-4000-8000-000000025361';

const MANAGER_EMAIL = 'pass253-module10-manager@example.test';
const READER_EMAIL = 'pass253-module10-reader@example.test';
const MODULE_10_PERMISSIONS = [
  'inventory.read',
  'inventory.item.manage',
  'inventory.receive',
  'inventory.transfer',
  'inventory.issue',
  'inventory.adjust'
];

let database;

/** Seed the smallest Stage-15 graph needed for the complete Inventory browser workflow and a restricted reader. */
async function seedScenario() {
  const testing = await import('@construction-erp/testing');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');

  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);

  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await database.company.create({
    data: {
      id: COMPANY_ID,
      legalName: 'Pass 253 Module 10 Company Limited',
      displayName: 'Pass 253 Module 10 Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  const permissions = [];
  for (const code of MODULE_10_PERMISSIONS) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: 'inventory' },
      create: { code, name: code, domain: 'inventory' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await database.role.createMany({
    data: [
      { id: MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'module10-browser-manager', name: 'Module 10 Browser Manager', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module10-browser-reader', name: 'Module 10 Browser Reader', isSystem: false, status: 'ACTIVE' }
    ]
  });
  await database.rolePermission.createMany({
    data: [
      ...MODULE_10_PERMISSIONS.map((code) => ({ roleId: MANAGER_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('inventory.read') }
    ]
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 253 Module 10 Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 253 Module 10 Reader', status: 'ACTIVE' }
    ]
  });
  await database.authCredential.createMany({
    data: [MANAGER_ID, READER_ID].map((userId) => ({ userId, passwordHash }))
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS253-CLIENT',
      legalName: 'Pass 253 Client Limited',
      displayName: 'Pass 253 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });
  await database.project.create({
    data: {
      id: PROJECT_ID,
      companyId: COMPANY_ID,
      projectCode: 'PASS253-PROJECT',
      name: 'Module 10 Browser Project',
      clientId: CLIENT_ID,
      status: 'ACTIVE',
      currency: 'USD',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
      projectManagerUserId: MANAGER_ID,
      location: 'Lahore, Pakistan'
    }
  });

  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: MANAGER_ID, roleId: MANAGER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate }
    ]
  });
  await database.projectMember.create({
    data: { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: READER_ID, projectRole: 'READER', status: 'ACTIVE', fromDate }
  });

  await database.wbsNode.create({
    data: { id: WBS_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, parentId: null, code: 'A', name: 'Materials', level: 0, status: 'ACTIVE', sortOrder: 10 }
  });
  await database.costCode.create({
    data: { id: COST_CODE_ID, companyId: COMPANY_ID, code: 'MAT-253', name: 'Materials', category: 'DIRECT', status: 'ACTIVE' }
  });
  await database.costType.create({
    data: { id: COST_TYPE_ID, companyId: COMPANY_ID, code: 'MAT', name: 'Material', status: 'ACTIVE' }
  });
  await database.projectCostCode.create({
    data: { id: COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' }
  });

  await database.inventoryItem.create({
    data: { id: ITEM_ID, companyId: COMPANY_ID, itemCode: 'PASS253-STEEL', name: 'Structural Steel', category: 'Materials', baseUnit: 'ea', status: 'ACTIVE', valuationMethod: 'AVERAGE' }
  });
  await database.warehouse.createMany({
    data: [
      { id: PROJECT_WAREHOUSE_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, code: 'SITE-253', name: 'Pass 253 Project Store', location: 'Project Site', status: 'ACTIVE' },
      { id: CENTRAL_WAREHOUSE_ID, companyId: COMPANY_ID, projectId: null, code: 'CENTRAL-253', name: 'Pass 253 Central Store', location: 'Main Yard', status: 'ACTIVE' }
    ]
  });
  await database.inventoryBalance.createMany({
    data: [
      { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID, quantityOnHand: '0.0000', reservedQuantity: '0.0000', averageCost: '0.0000' },
      { warehouseId: CENTRAL_WAREHOUSE_ID, itemId: ITEM_ID, quantityOnHand: '0.0000', reservedQuantity: '0.0000', averageCost: '0.0000' }
    ]
  });

  await database.vendor.create({
    data: { id: VENDOR_ID, companyId: COMPANY_ID, code: 'V-253', legalName: 'Pass 253 Vendor Limited', displayName: 'Pass 253 Vendor', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' }
  });
  await database.purchaseOrder.create({
    data: {
      id: PURCHASE_ORDER_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      poNo: 'PO-PASS253',
      vendorId: VENDOR_ID,
      quotationId: null,
      directPurchaseReason: 'Module 10 fixture uses the authorized direct-purchase source path.',
      orderDate: new Date('2026-08-20T00:00:00.000Z'),
      currency: 'USD',
      status: 'ISSUED',
      subtotal: '125.00',
      tax: '0.00',
      total: '125.00',
      deliveryAddress: 'Pass 253 Project Site',
      terms: 'Net 30 days'
    }
  });
  await database.purchaseOrderItem.create({
    data: {
      id: PURCHASE_ORDER_ITEM_ID,
      purchaseOrderId: PURCHASE_ORDER_ID,
      itemId: ITEM_ID,
      description: 'Structural steel',
      quantity: '10.0000',
      unit: 'ea',
      unitRate: '12.5000',
      taxRate: '0.0000',
      lineTotal: '125.00',
      wbsNodeId: WBS_ID,
      costCodeId: COST_CODE_ID,
      costTypeId: COST_TYPE_ID,
      receivedQty: '0.0000',
      invoicedAmount: '0.00'
    }
  });
  await database.numberSequence.create({
    data: { companyId: COMPANY_ID, sequenceKey: 'goods-receipt', prefix: 'GR-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
  });
}

/** Sign in through the real shared Module-24A browser form. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(email);
}

/** Open the permission-aware Inventory workspace from the shared admin shell. */
async function openModule10(page) {
  await page.getByRole('button', { name: 'Inventory & Materials' }).click();
  await expect(page.getByRole('heading', { name: 'Inventory & Material Management' })).toBeVisible();
}

/** Return true for one source operation or one reviewed Inventory repair operation. */
function isAllowedModule10Path(method, pathname) {
  if (pathname === '/api/v1/inventory/items') return method === 'GET' || method === 'POST';
  if (pathname === '/api/v1/inventory/balances') return method === 'GET';
  if (pathname === '/api/v1/inventory/warehouses') return method === 'GET' || method === 'POST';
  if (/^\/api\/v1\/inventory\/warehouses\/[0-9a-f-]{36}$/i.test(pathname)) return method === 'PATCH';
  if (pathname === '/api/v1/inventory/stock-ledger') return method === 'GET';
  if (pathname === '/api/v1/inventory/balances/minimum-stock') return method === 'PUT';
  if (pathname === '/api/v1/inventory/low-stock') return method === 'GET';
  if (pathname === '/api/v1/inventory/counts') return method === 'POST';
  if (/^\/api\/v1\/inventory\/counts\/[0-9a-f-]{36}$/i.test(pathname)) return method === 'GET';
  if (/^\/api\/v1\/inventory\/counts\/[0-9a-f-]{36}\/reconcile$/i.test(pathname)) return method === 'POST';
  return method === 'POST' && [
    '/api/v1/inventory/receipts',
    '/api/v1/inventory/transfers',
    '/api/v1/inventory/issues',
    '/api/v1/inventory/returns',
    '/api/v1/inventory/adjustments'
  ].includes(pathname);
}

/** Record real Module-10 browser requests so route, idempotency and server-authority boundaries can be asserted. */
function trackModule10Requests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/inventory')) return;

    let body = null;
    if (request.postData()) {
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
    }

    requests.push({
      method: request.method(),
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body,
      idempotencyKey: request.headers()['idempotency-key'] ?? null
    });
  });
  return requests;
}

/** Assert browser traffic stays inside the source + Pass-368 route contract and never owns calculated stock state. */
function assertModule10AuthorityBoundary(requests) {
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(isAllowedModule10Path(request.method, request.pathname)).toBe(true);
    const serializedBody = JSON.stringify(request.body ?? {});
    for (const field of [
      'companyId',
      'actorUserId',
      'permissions',
      'allowedProjectIds',
      'receiptNo',
      'receivedAt',
      'receivedBy',
      'status',
      'quantityOnHand',
      'reservedQuantity',
      'averageCost',
      'unitCost',
      'transactionType',
      'sourceType',
      'sourceId',
      'costStructureId',
      'occurredAt',
      'calculatedActualCost',
      'purchaseOrderReceivedQty'
    ]) expect(serializedBody).not.toContain(`\"${field}\"`);
  }

  const itemReads = requests.filter((request) => request.method === 'GET' && request.pathname === '/api/v1/inventory/items');
  const balanceReads = requests.filter((request) => request.method === 'GET' && request.pathname === '/api/v1/inventory/balances');
  const warehouseReads = requests.filter((request) => request.method === 'GET' && request.pathname === '/api/v1/inventory/warehouses');
  expect(itemReads.length).toBeGreaterThan(0);
  expect(balanceReads.length).toBeGreaterThan(0);
  expect(warehouseReads.length).toBeGreaterThan(0);
  for (const request of [...itemReads, ...balanceReads, ...warehouseReads]) {
    expect(Object.keys(request.query).sort()).toEqual(['page', 'pageSize']);
  }
  for (const request of requests.filter((candidate) => candidate.method === 'GET' && ['/api/v1/inventory/stock-ledger', '/api/v1/inventory/low-stock'].includes(candidate.pathname))) {
    expect(Object.keys(request.query).every((key) => ['page', 'pageSize', 'warehouseId', 'itemId'].includes(key))).toBe(true);
  }

  const createItem = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/inventory/items');
  expect(Object.keys(createItem?.body ?? {}).sort()).toEqual(['baseUnit', 'category', 'itemCode', 'name', 'valuationMethod']);
  expect(createItem?.idempotencyKey).toBeNull();

  const createWarehouse = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/inventory/warehouses');
  if (createWarehouse) {
    expect(Object.keys(createWarehouse.body ?? {}).sort()).toEqual(['code', 'location', 'name', 'projectId']);
    expect(createWarehouse.idempotencyKey).toBeNull();
  }
  const updateWarehouse = requests.find((request) => request.method === 'PATCH' && request.pathname.startsWith('/api/v1/inventory/warehouses/'));
  if (updateWarehouse) expect(Object.keys(updateWarehouse.body ?? {}).sort()).toEqual(['code', 'location', 'name']);
  const minimumStock = requests.find((request) => request.method === 'PUT' && request.pathname === '/api/v1/inventory/balances/minimum-stock');
  expect(Object.keys(minimumStock?.body ?? {}).sort()).toEqual(['itemId', 'minimumStockQuantity', 'warehouseId']);
  expect(minimumStock?.idempotencyKey).toBeNull();

  const expectedBodyKeys = new Map([
    ['/api/v1/inventory/receipts', ['items', 'purchaseOrderId', 'warehouseId']],
    ['/api/v1/inventory/transfers', ['destinationWarehouseId', 'itemId', 'quantity', 'sourceWarehouseId']],
    ['/api/v1/inventory/issues', ['costCodeId', 'costTypeId', 'itemId', 'projectId', 'quantity', 'warehouseId', 'wbsNodeId']],
    ['/api/v1/inventory/returns', ['quantity', 'reason', 'sourceTransactionId']],
    ['/api/v1/inventory/adjustments', ['itemId', 'quantityDelta', 'reason', 'warehouseId']]
  ]);
  for (const [pathname, keys] of expectedBodyKeys) {
    const request = requests.find((candidate) => candidate.method === 'POST' && candidate.pathname === pathname);
    expect(Object.keys(request?.body ?? {}).sort()).toEqual(keys);
    expect(request?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  }

  const receiptRequest = requests.find((request) => request.pathname === '/api/v1/inventory/receipts');
  expect(Object.keys(receiptRequest?.body?.items?.[0] ?? {}).sort()).toEqual(['acceptedQty', 'itemId', 'poItemId', 'quantity', 'rejectedQty']);

  const countRequest = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/inventory/counts');
  expect(Object.keys(countRequest?.body ?? {}).sort()).toEqual(['items', 'warehouseId']);
  expect(Object.keys(countRequest?.body?.items?.[0] ?? {}).sort()).toEqual(['countedQty', 'itemId']);
  expect(countRequest?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  const countReads = requests.filter((request) => request.method === 'GET' && /^\/api\/v1\/inventory\/counts\/[0-9a-f-]{36}$/i.test(request.pathname));
  expect(countReads.length).toBeGreaterThan(0);
  expect(countReads.every((request) => Object.keys(request.query).length === 0)).toBe(true);
  const reconcileRequest = requests.find((request) => request.method === 'POST' && /^\/api\/v1\/inventory\/counts\/[0-9a-f-]{36}\/reconcile$/i.test(request.pathname));
  expect(reconcileRequest?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(reconcileRequest?.body).toBeNull();

  for (const forbidden of ['/stock-counts', '/valuation', '/finance']) {
    expect(requests.some((request) => request.pathname.includes(forbidden))).toBe(false);
  }
}

/** Close the disposable database connection after all Module-10 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test.beforeAll(async () => {
  await seedScenario();
});

test('Module 10 browser workflow covers stock commands, durable physical-count reload/reconcile and permission denial', async ({ page, browser }) => {
  const managerRequests = trackModule10Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await openModule10(page);

  const itemForm = page.getByRole('heading', { name: 'Create item' }).locator('..');
  await itemForm.getByLabel('Item code').fill('BROWSER-EXTRA');
  await itemForm.getByLabel('Name').fill('Browser extra item');
  await itemForm.getByLabel('Category').fill('Materials');
  await itemForm.getByLabel('Base unit').fill('ea');
  await itemForm.getByLabel('Valuation method').fill('AVERAGE');
  await itemForm.getByRole('button', { name: 'Create item' }).click();
  await expect(itemForm.getByText('Created BROWSER-EXTRA · Browser extra item.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Item master' }).locator('..')).toContainText('BROWSER-EXTRA');

  const warehouseSection = page.getByRole('heading', { name: 'Warehouse / site-store master' }).locator('..');
  const createWarehouseForm = warehouseSection.getByRole('heading', { name: 'Create Warehouse / site store' }).locator('..');
  await createWarehouseForm.getByLabel('Project UUID (optional)').fill(PROJECT_ID);
  await createWarehouseForm.getByLabel('Code').fill('BROWSER-STORE');
  await createWarehouseForm.getByLabel('Name').fill('Browser Project Store');
  await createWarehouseForm.getByLabel('Location').fill('Browser Project Yard');
  await createWarehouseForm.getByRole('button', { name: 'Create Warehouse' }).click();
  await expect(createWarehouseForm.getByText('Created BROWSER-STORE · Browser Project Store.')).toBeVisible();

  const createdWarehouse = await database.warehouse.findFirstOrThrow({ where: { companyId: COMPANY_ID, code: 'BROWSER-STORE' } });
  const updateWarehouseForm = warehouseSection.getByRole('heading', { name: 'Update Warehouse details' }).locator('..');
  await updateWarehouseForm.getByLabel('Warehouse').selectOption(createdWarehouse.id);
  await updateWarehouseForm.getByLabel('Location').fill('Browser Project Yard Updated');
  await updateWarehouseForm.getByRole('button', { name: 'Save Warehouse' }).click();
  await expect(updateWarehouseForm.getByText('Updated BROWSER-STORE · Browser Project Store.')).toBeVisible();

  const receiptSection = page.getByRole('heading', { name: 'PO receipt' }).locator('..');
  await receiptSection.getByLabel('Purchase Order UUID').fill(PURCHASE_ORDER_ID);
  await receiptSection.getByLabel('Warehouse UUID').fill(PROJECT_WAREHOUSE_ID);
  await receiptSection.getByLabel('PO item UUID').fill(PURCHASE_ORDER_ITEM_ID);
  await receiptSection.getByLabel('Inventory item UUID').fill(ITEM_ID);
  await receiptSection.getByLabel('Quantity').fill('5.0000');
  await receiptSection.getByLabel('Accepted').fill('4.0000');
  await receiptSection.getByLabel('Rejected').fill('1.0000');
  await receiptSection.getByRole('button', { name: 'Receive material' }).click();
  await expect(receiptSection.getByText('Receipt GR-0001 posted with 1 line(s).')).toBeVisible();

  let projectBalance = await database.inventoryBalance.findUniqueOrThrow({
    where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } }
  });
  expect(projectBalance.quantityOnHand.toString()).toBe('4');
  expect(projectBalance.averageCost.toString()).toBe('12.5');
  const poLine = await database.purchaseOrderItem.findUniqueOrThrow({ where: { id: PURCHASE_ORDER_ITEM_ID } });
  expect(poLine.receivedQty.toString()).toBe('4');

  const transferSection = page.getByRole('heading', { name: 'Transfer stock' }).locator('..');
  await transferSection.getByLabel('Source Warehouse UUID').fill(PROJECT_WAREHOUSE_ID);
  await transferSection.getByLabel('Destination Warehouse UUID').fill(CENTRAL_WAREHOUSE_ID);
  await transferSection.getByLabel('Item UUID').fill(ITEM_ID);
  await transferSection.getByLabel('Quantity').fill('1.0000');
  await transferSection.getByRole('button', { name: 'Transfer stock' }).click();
  await expect(transferSection.getByText('TRANSFER_OUT', { exact: true })).toBeVisible();
  await expect(transferSection.getByText('TRANSFER_IN', { exact: true })).toBeVisible();

  const issueSection = page.getByRole('heading', { name: 'Issue material to Project' }).locator('..');
  await issueSection.getByLabel('Warehouse UUID').fill(PROJECT_WAREHOUSE_ID);
  await issueSection.getByLabel('Project UUID').fill(PROJECT_ID);
  await issueSection.getByLabel('Item UUID').fill(ITEM_ID);
  await issueSection.getByLabel('Quantity').fill('2.0000');
  await issueSection.getByLabel('WBS node UUID').fill(WBS_ID);
  await issueSection.getByLabel('Cost code UUID').fill(COST_CODE_ID);
  await issueSection.getByLabel('Cost type UUID').fill(COST_TYPE_ID);
  await issueSection.getByRole('button', { name: 'Issue material' }).click();
  await expect(issueSection.getByText('ISSUE', { exact: true })).toBeVisible();

  const issue = await database.stockTransaction.findFirstOrThrow({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, itemId: ITEM_ID, transactionType: 'ISSUE' },
    orderBy: { occurredAt: 'desc' }
  });
  const issueActual = await database.costActual.findFirstOrThrow({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'inventory_issue', sourceId: issue.id }
  });
  expect(issue.quantity.toString()).toBe('-2');
  expect(issueActual.amount.toString()).toBe('25');

  const returnSection = page.getByRole('heading', { name: 'Return issued material' }).locator('..');
  await returnSection.getByLabel('Source transaction UUID').fill(issue.id);
  await returnSection.getByLabel('Quantity').fill('1.0000');
  await returnSection.getByLabel('Reason').fill('Unused site material returned in Pass 253');
  await returnSection.getByRole('button', { name: 'Return material' }).click();
  await expect(returnSection.getByText('RETURN', { exact: true })).toBeVisible();
  const returnActual = await database.costActual.findFirstOrThrow({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'inventory_return' }
  });
  expect(returnActual.amount.toString()).toBe('-12.5');

  const adjustmentSection = page.getByRole('heading', { name: 'Inventory count adjustments' }).locator('..');
  await adjustmentSection.getByLabel('Warehouse UUID').fill(PROJECT_WAREHOUSE_ID);
  await adjustmentSection.getByLabel('Item UUID').fill(ITEM_ID);
  await adjustmentSection.getByLabel('Quantity delta').fill('-0.5000');
  await adjustmentSection.getByLabel('Reason').fill('Verified count correction in Pass 253');
  await adjustmentSection.getByRole('button', { name: 'Post adjustment' }).click();
  await expect(adjustmentSection.getByText('ADJUSTMENT', { exact: true })).toBeVisible();

  projectBalance = await database.inventoryBalance.findUniqueOrThrow({
    where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } }
  });
  const centralBalance = await database.inventoryBalance.findUniqueOrThrow({
    where: { warehouseId_itemId: { warehouseId: CENTRAL_WAREHOUSE_ID, itemId: ITEM_ID } }
  });
  expect(projectBalance.quantityOnHand.toString()).toBe('1.5');
  expect(centralBalance.quantityOnHand.toString()).toBe('1');

  const physicalCountSection = page.getByRole('heading', { name: 'Physical inventory count' }).locator('..');
  await physicalCountSection.getByLabel('Warehouse').selectOption(PROJECT_WAREHOUSE_ID);
  await physicalCountSection.getByLabel('Item').selectOption(ITEM_ID);
  await physicalCountSection.getByLabel('Counted quantity').fill('1.5000');
  await physicalCountSection.getByRole('button', { name: 'Capture count' }).click();
  const durableCount = await database.inventoryCount.findFirstOrThrow({
    where: { warehouseId: PROJECT_WAREHOUSE_ID },
    orderBy: { createdAt: 'desc' }
  });
  await expect(physicalCountSection).toContainText(durableCount.id);
  await expect(physicalCountSection).toContainText('DRAFT');
  expect(await page.evaluate(() => sessionStorage.getItem('construction-erp-module-10-selected-count-id'))).toBe(durableCount.id);

  await page.reload();
  await openModule10(page);
  const reloadedCountSection = page.getByRole('heading', { name: 'Physical inventory count' }).locator('..');
  await expect(reloadedCountSection).toContainText(durableCount.id);
  await expect(reloadedCountSection).toContainText('DRAFT');
  await reloadedCountSection.getByRole('button', { name: 'Reconcile count' }).click();
  await expect(reloadedCountSection).toContainText('RECONCILED');
  expect((await database.inventoryCount.findUniqueOrThrow({ where: { id: durableCount.id } })).status).toBe('RECONCILED');

  const balanceSection = page.getByRole('heading', { name: 'Warehouse balances' }).locator('..');
  await expect(balanceSection.getByText('SITE-253 · Pass 253 Project Store', { exact: true })).toBeVisible();
  await expect(balanceSection.getByText('CENTRAL-253 · Pass 253 Central Store', { exact: true })).toBeVisible();

  const minimumSection = page.getByRole('heading', { name: 'Minimum stock policy' }).locator('..');
  await minimumSection.getByLabel('Warehouse').selectOption(PROJECT_WAREHOUSE_ID);
  await minimumSection.getByLabel('Item').selectOption(ITEM_ID);
  await minimumSection.getByLabel('Minimum quantity').fill('2.0000');
  await minimumSection.getByRole('button', { name: 'Save minimum stock' }).click();
  await expect(minimumSection.getByText('Minimum stock is now 2.')).toBeVisible();

  const ledgerSection = page.getByRole('heading', { name: 'Stock ledger' }).locator('..');
  await expect(ledgerSection.getByText('ISSUE', { exact: true })).toBeVisible();
  await expect(ledgerSection.getByText('RETURN', { exact: true })).toBeVisible();
  const lowStockSection = page.getByRole('heading', { name: 'Low-stock view' }).locator('..');
  await expect(lowStockSection.getByText('SITE-253 · Pass 253 Project Store', { exact: true })).toBeVisible();
  await expect(lowStockSection.getByText('PASS253-STEEL · Structural Steel', { exact: true })).toBeVisible();
  await expect(lowStockSection.getByText('1.5', { exact: true })).toBeVisible();
  await expect(lowStockSection.getByText('2', { exact: true })).toBeVisible();

  const expectedEvents = [
    'inventory.received',
    'inventory.transferred',
    'inventory.issued',
    'inventory.returned',
    'inventory.adjusted'
  ];
  for (const eventType of expectedEvents) {
    expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType } })).toBe(1);
    expect(await database.auditLog.count({ where: { companyId: COMPANY_ID, action: eventType } })).toBe(1);
  }
  expect(await database.journal.count({ where: { companyId: COMPANY_ID } })).toBe(0);

  assertModule10AuthorityBoundary(managerRequests);

  const readerContext = await browser.newContext({ baseURL: WEB_URL });
  const readerPage = await readerContext.newPage();
  try {
    await signIn(readerPage, READER_EMAIL);
    await openModule10(readerPage);

    const readerBalances = readerPage.getByRole('heading', { name: 'Warehouse balances' }).locator('..');
    await expect(readerBalances.getByText('SITE-253 · Pass 253 Project Store', { exact: true })).toBeVisible();
    await expect(readerBalances.getByText('CENTRAL-253 · Pass 253 Central Store', { exact: true })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Create item' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Create Warehouse' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Minimum stock policy' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Stock ledger' })).toBeVisible();
    await expect(readerPage.getByRole('heading', { name: 'Low-stock view' })).toBeVisible();
    await expect(readerPage.getByRole('heading', { name: 'PO receipt' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Transfer stock' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Issue material to Project' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Return issued material' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Physical inventory count' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Inventory count adjustments' })).toHaveCount(0);

    const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(readerToken).toBeTruthy();
    const deniedItem = await readerPage.request.post(`${API_BASE_URL}/inventory/items`, {
      headers: { authorization: `Bearer ${readerToken}` },
      data: { itemCode: 'DENIED', name: 'Denied item', category: 'Materials', baseUnit: 'ea', valuationMethod: 'AVERAGE' }
    });
    expect(deniedItem.status()).toBe(403);

    const deniedWarehouse = await readerPage.request.post(`${API_BASE_URL}/inventory/warehouses`, {
      headers: { authorization: `Bearer ${readerToken}` },
      data: { projectId: PROJECT_ID, code: 'DENIED-WH', name: 'Denied Warehouse', location: 'Denied' }
    });
    expect(deniedWarehouse.status()).toBe(403);
    const deniedThreshold = await readerPage.request.put(`${API_BASE_URL}/inventory/balances/minimum-stock`, {
      headers: { authorization: `Bearer ${readerToken}` },
      data: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID, minimumStockQuantity: '5.0000' }
    });
    expect(deniedThreshold.status()).toBe(403);

    const deniedIssue = await readerPage.request.post(`${API_BASE_URL}/inventory/issues`, {
      headers: { authorization: `Bearer ${readerToken}`, 'Idempotency-Key': 'pass253-reader-denied-issue' },
      data: {
        warehouseId: PROJECT_WAREHOUSE_ID,
        projectId: PROJECT_ID,
        itemId: ITEM_ID,
        quantity: '0.5000',
        wbsNodeId: WBS_ID,
        costCodeId: COST_CODE_ID,
        costTypeId: COST_TYPE_ID
      }
    });
    expect(deniedIssue.status()).toBe(403);
  } finally {
    await readerContext.close();
  }
});
