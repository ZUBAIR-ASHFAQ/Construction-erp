import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000010001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000010002';
const ADMIN_ID = '00000000-0000-4000-8000-000000010010';
const READER_ID = '00000000-0000-4000-8000-000000010011';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000010012';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000010020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000010021';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000010022';
const CLIENT_ID = '00000000-0000-4000-8000-000000010030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000010031';
const PROJECT_ID = '00000000-0000-4000-8000-000000010040';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-000000010041';
const CLOSED_PROJECT_ID = '00000000-0000-4000-8000-000000010042';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000010043';
const WBS_ID = '00000000-0000-4000-8000-000000010050';
const COST_CODE_ID = '00000000-0000-4000-8000-000000010060';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000010070';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000010080';
const ITEM_ID = '00000000-0000-4000-8000-000000010100';
const FOREIGN_ITEM_ID = '00000000-0000-4000-8000-000000010101';
const PROJECT_WAREHOUSE_ID = '00000000-0000-4000-8000-000000010110';
const CENTRAL_WAREHOUSE_ID = '00000000-0000-4000-8000-000000010111';
const OTHER_WAREHOUSE_ID = '00000000-0000-4000-8000-000000010112';
const CLOSED_WAREHOUSE_ID = '00000000-0000-4000-8000-000000010113';
const FOREIGN_WAREHOUSE_ID = '00000000-0000-4000-8000-000000010114';
const VENDOR_ID = '00000000-0000-4000-8000-000000010120';
const VENDOR_B_ID = '00000000-0000-4000-8000-000000010121';
const PURCHASE_ORDER_ID = '00000000-0000-4000-8000-000000010130';
const PURCHASE_ORDER_ITEM_ID = '00000000-0000-4000-8000-000000010131';
const PURCHASE_ORDER_UNIT_MISMATCH_ITEM_ID = '00000000-0000-4000-8000-000000010132';
const PASSWORD = 'Module10-pass-251-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-module10-auth-secret-0123456789abcdef';

const MODULE_10_PERMISSIONS = [
  'inventory.read',
  'inventory.item.manage',
  'inventory.receive',
  'inventory.transfer',
  'inventory.issue',
  'inventory.adjust'
];

/** Load compiled runtime packages only when the disposable PostgreSQL gate is explicitly enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the smallest Stage-15 graph needed for real Inventory API, scope and persistence verification. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 10 Company Ltd',
        displayName: 'Module 10 Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 10 Foreign Company Ltd',
        displayName: 'Module 10 Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of MODULE_10_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'inventory' },
      create: { code, name: code, domain: 'inventory' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module-10-project-reader', name: 'Module 10 Project Reader', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...MODULE_10_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('inventory.read') },
      ...MODULE_10_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module10-admin@example.test', name: 'Module 10 Admin' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'module10-reader@example.test', name: 'Module 10 Reader' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module10-admin-b@example.test', name: 'Module 10 Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      { id: CLIENT_ID, companyId: COMPANY_ID, code: 'M10-CLIENT', legalName: 'Module 10 Client Ltd', displayName: 'Module 10 Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE', creditTermsDays: 30 },
      { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'M10-FOREIGN', legalName: 'Module 10 Foreign Client Ltd', displayName: 'Module 10 Foreign Client', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE', creditTermsDays: 30 }
    ]
  });

  await client.project.createMany({
    data: [
      { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M10-A', name: 'Module 10 Project A', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Lahore, Pakistan' },
      { id: OTHER_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M10-OTHER', name: 'Module 10 Other Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Islamabad, Pakistan' },
      { id: CLOSED_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M10-CLOSED', name: 'Module 10 Closed Project', clientId: CLIENT_ID, status: 'CLOSED', currency: 'USD', startDate: new Date('2025-01-01T00:00:00.000Z'), plannedEndDate: new Date('2025-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Rawalpindi, Pakistan' },
      { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'M10-B', name: 'Module 10 Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID, location: 'Karachi, Pakistan' }
    ]
  });

  await client.projectMember.create({
    data: { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: READER_ID, projectRole: 'READER', status: 'ACTIVE', fromDate }
  });

  await client.wbsNode.create({
    data: { id: WBS_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, parentId: null, code: 'A', name: 'Module 10 WBS', level: 0, status: 'ACTIVE', sortOrder: 10 }
  });
  await client.costCode.create({
    data: { id: COST_CODE_ID, companyId: COMPANY_ID, code: 'MAT-100', name: 'Materials', category: 'DIRECT', status: 'ACTIVE' }
  });
  await client.costType.create({
    data: { id: COST_TYPE_ID, companyId: COMPANY_ID, code: 'MAT', name: 'Materials', status: 'ACTIVE' }
  });
  await client.projectCostCode.create({
    data: { id: COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' }
  });

  await client.inventoryItem.createMany({
    data: [
      { id: ITEM_ID, companyId: COMPANY_ID, itemCode: 'M10-STEEL', name: 'Structural Steel', category: 'Materials', baseUnit: 'ea', status: 'ACTIVE', valuationMethod: 'AVERAGE' },
      { id: FOREIGN_ITEM_ID, companyId: COMPANY_B_ID, itemCode: 'M10-FOREIGN', name: 'Foreign Material', category: 'Materials', baseUnit: 'ea', status: 'ACTIVE', valuationMethod: 'AVERAGE' }
    ]
  });

  await client.warehouse.createMany({
    data: [
      { id: PROJECT_WAREHOUSE_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, code: 'SITE-A', name: 'Project A Site Store', location: 'Project A Site', status: 'ACTIVE' },
      { id: CENTRAL_WAREHOUSE_ID, companyId: COMPANY_ID, projectId: null, code: 'CENTRAL', name: 'Central Store', location: 'Main Yard', status: 'ACTIVE' },
      { id: OTHER_WAREHOUSE_ID, companyId: COMPANY_ID, projectId: OTHER_PROJECT_ID, code: 'SITE-O', name: 'Other Project Store', location: 'Other Project', status: 'ACTIVE' },
      { id: CLOSED_WAREHOUSE_ID, companyId: COMPANY_ID, projectId: CLOSED_PROJECT_ID, code: 'SITE-C', name: 'Closed Project Store', location: 'Closed Project', status: 'ACTIVE' },
      { id: FOREIGN_WAREHOUSE_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, code: 'SITE-B', name: 'Foreign Project Store', location: 'Foreign Project', status: 'ACTIVE' }
    ]
  });

  await client.inventoryBalance.createMany({
    data: [
      { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID, quantityOnHand: '0.0000', reservedQuantity: '0.0000', averageCost: '0.0000' },
      { warehouseId: CENTRAL_WAREHOUSE_ID, itemId: ITEM_ID, quantityOnHand: '0.0000', reservedQuantity: '0.0000', averageCost: '0.0000' },
      { warehouseId: OTHER_WAREHOUSE_ID, itemId: ITEM_ID, quantityOnHand: '2.0000', reservedQuantity: '0.0000', averageCost: '9.0000' },
      { warehouseId: CLOSED_WAREHOUSE_ID, itemId: ITEM_ID, quantityOnHand: '2.0000', reservedQuantity: '0.0000', averageCost: '9.0000' },
      { warehouseId: FOREIGN_WAREHOUSE_ID, itemId: FOREIGN_ITEM_ID, quantityOnHand: '5.0000', reservedQuantity: '0.0000', averageCost: '8.0000' }
    ]
  });

  await client.vendor.createMany({
    data: [
      { id: VENDOR_ID, companyId: COMPANY_ID, code: 'M10-V001', legalName: 'Module 10 Vendor Ltd', displayName: 'Module 10 Vendor', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' },
      { id: VENDOR_B_ID, companyId: COMPANY_B_ID, code: 'M10-VB', legalName: 'Module 10 Foreign Vendor Ltd', displayName: 'Module 10 Foreign Vendor', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' }
    ]
  });

  await client.purchaseOrder.create({
    data: {
      id: PURCHASE_ORDER_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      poNo: 'PO-M10-001',
      vendorId: VENDOR_ID,
      quotationId: null,
      directPurchaseReason: 'Module 10 fixture uses the authorized direct-purchase source path.',
      orderDate: new Date('2026-08-20T00:00:00.000Z'),
      currency: 'USD',
      status: 'ISSUED',
      subtotal: '175.00',
      tax: '0.00',
      total: '175.00',
      deliveryAddress: 'Project A Site',
      terms: 'Net 30 days'
    }
  });
  await client.purchaseOrderItem.createMany({
    data: [
      {
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
      },
      {
        id: PURCHASE_ORDER_UNIT_MISMATCH_ITEM_ID,
        purchaseOrderId: PURCHASE_ORDER_ID,
        itemId: null,
        description: 'Unit mismatch fixture',
        quantity: '5.0000',
        unit: 'kg',
        unitRate: '10.0000',
        taxRate: '0.0000',
        lineTotal: '50.00',
        wbsNodeId: WBS_ID,
        costCodeId: COST_CODE_ID,
        costTypeId: COST_TYPE_ID,
        receivedQty: '0.0000',
        invoicedAmount: '0.00'
      }
    ]
  });

  await client.numberSequence.create({
    data: { companyId: COMPANY_ID, sequenceKey: 'goods-receipt', prefix: 'GR-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
  });
}

/** Build one fresh Fastify app over the explicitly disposable PostgreSQL integration database. */
async function withApi(work) {
  const runtime = await loadRuntime();
  const environment = runtime.testing.loadFoundationTestEnvironment();
  const client = runtime.testing.createFoundationTestDatabaseClient(environment);
  let app;

  try {
    await client.$connect();
    await runtime.testing.resetFoundationTestData(client);
    await seedScenario(client, runtime.hashPassword);
    app = runtime.buildApp({
      database: client,
      nodeEnv: 'test',
      logLevel: 'silent',
      authActionTokenSecret: AUTH_ACTION_TOKEN_SECRET
    });
    await app.ready();
    await work({ ...runtime, app, client });
  } finally {
    if (app) await app.close();
    else await client.$disconnect();
  }
}

/** Sign in one seeded user through the real Module-24A route. */
async function signIn(app, email = 'module10-admin@example.test') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Return the stable public error code from one Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Return one generated Module-10 OpenAPI operation and fail clearly when it is missing. */
function module10OpenApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

/** Build one valid receipt command for the seeded issued Purchase Order. */
function receiptPayload(overrides = {}) {
  return {
    purchaseOrderId: overrides.purchaseOrderId ?? PURCHASE_ORDER_ID,
    warehouseId: overrides.warehouseId ?? PROJECT_WAREHOUSE_ID,
    items: overrides.items ?? [{
      poItemId: PURCHASE_ORDER_ITEM_ID,
      itemId: ITEM_ID,
      quantity: '5.0000',
      acceptedQty: '4.0000',
      rejectedQty: '1.0000'
    }],
    ...(overrides.extraBody ?? {})
  };
}

/** Send one stock command with bearer authentication and a required Foundation idempotency key. */
async function stockCommand(app, token, route, payload, key) {
  return app.inject({
    method: 'POST',
    url: route,
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': key
    },
    payload
  });
}

/** Install a disposable trigger that forces one Inventory outbox event to fail late in the business transaction. */
async function installOutboxFailure(client, eventType) {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION module_10_pass251_fail_outbox_event()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.event_type = TG_ARGV[0] THEN
        RAISE EXCEPTION 'Module 10 Pass 251 forced outbox failure for %', TG_ARGV[0]
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_10_pass251_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe(`
    CREATE TRIGGER module_10_pass251_fail_outbox
    BEFORE INSERT ON outbox_events
    FOR EACH ROW
    EXECUTE FUNCTION module_10_pass251_fail_outbox_event('${eventType}')
  `);
}

/** Remove the disposable Pass-251 failure trigger/function. */
async function removeOutboxFailure(client) {
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_10_pass251_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS module_10_pass251_fail_outbox_event()');
}

test('Module 10 PostgreSQL/Fastify workflow covers receipt, balance, transfer, issue, return, adjustment and Module-7 actual cost', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/items?page=1&pageSize=10',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, ITEM_ID);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory/items',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        itemCode: 'M10-CEMENT',
        name: 'Cement Bag',
        category: 'Materials',
        baseUnit: 'bag',
        valuationMethod: 'AVERAGE'
      }
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.status, 'ACTIVE');

    const receipt = await stockCommand(
      app,
      token,
      '/api/v1/inventory/receipts',
      receiptPayload(),
      'module10-receipt-main'
    );
    assert.equal(receipt.statusCode, 201, receipt.body);
    const received = receipt.json().data;
    assert.equal(received.receiptNo, 'GR-0001');
    assert.equal(received.items[0].unitCost, '12.5');
    assert.equal(received.items[0].acceptedQty, '4');
    assert.equal(received.items[0].rejectedQty, '1');

    const replay = await stockCommand(
      app,
      token,
      '/api/v1/inventory/receipts',
      receiptPayload(),
      'module10-receipt-main'
    );
    assert.equal(replay.statusCode, 201, replay.body);
    assert.equal(replay.json().data.id, received.id);
    assert.equal(await client.goodsReceipt.count({ where: { companyId: COMPANY_ID } }), 1);
    assert.equal(await client.stockTransaction.count({ where: { companyId: COMPANY_ID, transactionType: 'RECEIPT' } }), 1);

    let balance = await client.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } }
    });
    assert.equal(balance.quantityOnHand.toString(), '4');
    assert.equal(balance.averageCost.toString(), '12.5');
    const poLine = await client.purchaseOrderItem.findUniqueOrThrow({ where: { id: PURCHASE_ORDER_ITEM_ID } });
    assert.equal(poLine.receivedQty.toString(), '4');

    response = await stockCommand(app, token, '/api/v1/inventory/transfers', {
      sourceWarehouseId: PROJECT_WAREHOUSE_ID,
      destinationWarehouseId: CENTRAL_WAREHOUSE_ID,
      itemId: ITEM_ID,
      quantity: '1.0000'
    }, 'module10-transfer-main');
    assert.equal(response.statusCode, 201, response.body);
    assert.deepEqual(response.json().data.transactions.map((row) => row.transactionType).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);

    response = await stockCommand(app, token, '/api/v1/inventory/issues', {
      warehouseId: PROJECT_WAREHOUSE_ID,
      projectId: PROJECT_ID,
      itemId: ITEM_ID,
      quantity: '2.0000',
      wbsNodeId: WBS_ID,
      costCodeId: COST_CODE_ID,
      costTypeId: COST_TYPE_ID
    }, 'module10-issue-main');
    assert.equal(response.statusCode, 201, response.body);
    const issue = response.json().data;
    assert.equal(issue.transactionType, 'ISSUE');
    assert.equal(issue.quantity, '-2');

    const issueActual = await client.costActual.findFirstOrThrow({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'inventory_issue' }
    });
    assert.equal(issueActual.amount.toString(), '25');

    response = await stockCommand(app, token, '/api/v1/inventory/returns', {
      sourceTransactionId: issue.id,
      quantity: '1.0000',
      reason: 'Unused site material returned'
    }, 'module10-return-main');
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.transactionType, 'RETURN');
    const returnActual = await client.costActual.findFirstOrThrow({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'inventory_return' }
    });
    assert.equal(returnActual.amount.toString(), '-12.5');

    response = await stockCommand(app, token, '/api/v1/inventory/adjustments', {
      warehouseId: PROJECT_WAREHOUSE_ID,
      itemId: ITEM_ID,
      quantityDelta: '-0.5000',
      reason: 'Verified count correction'
    }, 'module10-adjust-main');
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.transactionType, 'ADJUSTMENT');

    balance = await client.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } }
    });
    assert.equal(balance.quantityOnHand.toString(), '1.5');
    const centralBalance = await client.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId: CENTRAL_WAREHOUSE_ID, itemId: ITEM_ID } }
    });
    assert.equal(centralBalance.quantityOnHand.toString(), '1');

    const expectedEvents = [
      'inventory.received',
      'inventory.transferred',
      'inventory.issued',
      'inventory.returned',
      'inventory.adjusted'
    ];
    const events = await client.outboxEvent.findMany({
      where: { companyId: COMPANY_ID, eventType: { in: expectedEvents } },
      orderBy: { eventType: 'asc' }
    });
    assert.deepEqual(events.map((event) => event.eventType).sort(), expectedEvents.sort());
    for (const action of expectedEvents) {
      assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action } }), 1, action);
    }
  });
});

test('Module 10 security rejects unauthenticated writes, missing permission, restricted Project leakage, cross-Company access and browser authority', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'module10-reader@example.test');
    const foreignToken = await signIn(app, 'module10-admin-b@example.test');

    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory/items',
      payload: { itemCode: 'NOAUTH', name: 'No auth', category: 'Test', baseUnit: 'ea', valuationMethod: 'AVERAGE' }
    });
    assert.equal(response.statusCode, 401, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/items',
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/balances?page=1&pageSize=20',
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].warehouseId, PROJECT_WAREHOUSE_ID);

    response = await stockCommand(app, readerToken, '/api/v1/inventory/adjustments', {
      warehouseId: PROJECT_WAREHOUSE_ID,
      itemId: ITEM_ID,
      quantityDelta: '1.0000',
      reason: 'Reader must not adjust'
    }, 'module10-reader-adjust');
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await stockCommand(app, readerToken, '/api/v1/inventory/issues', {
      warehouseId: OTHER_WAREHOUSE_ID,
      projectId: OTHER_PROJECT_ID,
      itemId: ITEM_ID,
      quantity: '1.0000',
      wbsNodeId: WBS_ID,
      costCodeId: COST_CODE_ID,
      costTypeId: COST_TYPE_ID
    }, 'module10-reader-other-project');
    assert.equal(response.statusCode, 403, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/items',
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, FOREIGN_ITEM_ID);

    response = await stockCommand(app, foreignToken, '/api/v1/inventory/receipts', receiptPayload(), 'module10-foreign-receipt');
    assert.equal(response.statusCode, 404, response.body);

    response = await stockCommand(app, adminToken, '/api/v1/inventory/receipts', receiptPayload({ warehouseId: FOREIGN_WAREHOUSE_ID }), 'module10-cross-company-warehouse');
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'WAREHOUSE_NOT_FOUND');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory/items',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        itemCode: 'M10-BROWSER-AUTH',
        name: 'Browser Authority Probe',
        category: 'Test',
        baseUnit: 'ea',
        valuationMethod: 'AVERAGE',
        companyId: COMPANY_B_ID,
        status: 'INACTIVE'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await stockCommand(app, adminToken, '/api/v1/inventory/receipts', receiptPayload(), '');
    assert.equal(response.statusCode, 400, response.body);
  });
});


test('Module 10 Pass 368 manages Warehouses and reads ledger/low-stock through existing RBAC scope', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'module10-reader@example.test');
    const foreignToken = await signIn(app, 'module10-admin-b@example.test');

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/warehouses?page=1&pageSize=20',
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items.map((warehouse) => warehouse.id), [PROJECT_WAREHOUSE_ID]);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory/warehouses',
      headers: { authorization: `Bearer ${readerToken}` },
      payload: { projectId: PROJECT_ID, code: 'DENIED-WH', name: 'Denied Warehouse', location: 'Denied' }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory/warehouses',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { projectId: PROJECT_ID, code: 'PASS368-SITE', name: 'Pass 368 Site Store', location: 'Initial location' }
    });
    assert.equal(response.statusCode, 201, response.body);
    const createdWarehouse = response.json().data;
    assert.equal(createdWarehouse.projectId, PROJECT_ID);
    assert.equal(createdWarehouse.status, 'ACTIVE');

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/inventory/warehouses/${createdWarehouse.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: 'PASS368-SITE', name: 'Pass 368 Site Store', location: 'Updated location' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.location, 'Updated location');
    assert.equal(response.json().data.projectId, PROJECT_ID);

    response = await app.inject({
      method: 'PUT',
      url: '/api/v1/inventory/balances/minimum-stock',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID, minimumStockQuantity: '1.0000' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.minimumStockQuantity, '1');
    assert.equal(response.json().data.quantityOnHand, '0');

    response = await stockCommand(app, adminToken, '/api/v1/inventory/adjustments', {
      warehouseId: PROJECT_WAREHOUSE_ID,
      itemId: ITEM_ID,
      quantityDelta: '0.5000',
      reason: 'Pass 368 low-stock and ledger verification'
    }, 'module10-pass368-adjust');
    assert.equal(response.statusCode, 201, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/inventory/stock-ledger?page=1&pageSize=20&warehouseId=${PROJECT_WAREHOUSE_ID}&itemId=${ITEM_ID}`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].transactionType, 'ADJUSTMENT');
    assert.equal(response.json().data.items[0].warehouseCode, 'SITE-A');
    assert.equal(response.json().data.items[0].itemCode, 'M10-STEEL');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/inventory/low-stock?page=1&pageSize=20&warehouseId=${PROJECT_WAREHOUSE_ID}&itemId=${ITEM_ID}`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].quantityOnHand, '0.5');
    assert.equal(response.json().data.items[0].minimumStockQuantity, '1');

    response = await app.inject({
      method: 'PUT',
      url: '/api/v1/inventory/balances/minimum-stock',
      headers: { authorization: `Bearer ${readerToken}` },
      payload: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID, minimumStockQuantity: '2.0000' }
    });
    assert.equal(response.statusCode, 403, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/warehouses?page=1&pageSize=20',
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items.map((warehouse) => warehouse.id), [FOREIGN_WAREHOUSE_ID]);

    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'inventory.warehouse_created' } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'inventory.warehouse_updated' } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'inventory.minimum_stock_updated' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: { in: ['inventory.warehouse_created', 'inventory.warehouse_updated', 'inventory.minimum_stock_updated'] } } }), 0);
  });
});

test('Module 10 Pass 369 converts approved PO units, reconciles physical counts and enforces Inventory stock-period locks', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const authorization = { authorization: `Bearer ${token}` };

    const conversion = await app.inject({
      method: 'PUT',
      url: `/api/v1/inventory/items/${ITEM_ID}/unit-conversions`,
      headers: authorization,
      payload: { units: [{ unit: 'kg', factorToBase: '2.0000' }] }
    });
    assert.equal(conversion.statusCode, 200, conversion.body);
    assert.equal(conversion.json().data.units[0].unit, 'KG');

    const receipt = await stockCommand(app, token, '/api/v1/inventory/receipts', receiptPayload({
      items: [{
        poItemId: PURCHASE_ORDER_UNIT_MISMATCH_ITEM_ID,
        itemId: ITEM_ID,
        quantity: '1.0000',
        acceptedQty: '1.0000',
        rejectedQty: '0.0000'
      }]
    }), 'module10-pass369-converted-receipt');
    assert.equal(receipt.statusCode, 201, receipt.body);
    assert.equal(receipt.json().data.items[0].sourceUnit, 'KG');
    assert.equal(receipt.json().data.items[0].conversionFactor, '2.0000');
    assert.equal(receipt.json().data.items[0].acceptedBaseQty, '2.0000');
    assert.equal(receipt.json().data.items[0].unitCost, '5.0000');

    const count = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory/counts',
      headers: { ...authorization, 'idempotency-key': 'module10-pass369-count-create' },
      payload: { warehouseId: PROJECT_WAREHOUSE_ID, items: [{ itemId: ITEM_ID, countedQty: '3.0000' }] }
    });
    assert.equal(count.statusCode, 201, count.body);
    const countBody = count.json().data;
    assert.equal(countBody.lines[0].expectedQty, '2.0000');
    assert.equal(countBody.lines[0].varianceQty, '1.0000');

    const reconciled = await app.inject({
      method: 'POST',
      url: `/api/v1/inventory/counts/${countBody.id}/reconcile`,
      headers: { ...authorization, 'idempotency-key': 'module10-pass369-count-reconcile' }
    });
    assert.equal(reconciled.statusCode, 200, reconciled.body);
    assert.equal(reconciled.json().data.status, 'RECONCILED');
    assert.ok(reconciled.json().data.lines[0].adjustmentTransactionId);

    const balance = await client.inventoryBalance.findUnique({
      where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } }
    });
    assert.equal(balance.quantityOnHand.toFixed(4), '3.0000');
    const countMovement = await client.stockTransaction.findFirst({
      where: { companyId: COMPANY_ID, sourceType: 'inventory_count', sourceId: countBody.id }
    });
    assert.equal(countMovement.quantity.toFixed(4), '1.0000');

    const period = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory/stock-periods',
      headers: authorization,
      payload: { startDate: '2020-01-01', endDate: '2099-12-31' }
    });
    assert.equal(period.statusCode, 201, period.body);
    const locked = await app.inject({
      method: 'POST',
      url: `/api/v1/inventory/stock-periods/${period.json().data.id}/lock`,
      headers: authorization
    });
    assert.equal(locked.statusCode, 200, locked.body);
    assert.equal(locked.json().data.status, 'LOCKED');

    const blocked = await stockCommand(app, token, '/api/v1/inventory/adjustments', {
      warehouseId: PROJECT_WAREHOUSE_ID,
      itemId: ITEM_ID,
      quantityDelta: '1.0000',
      reason: 'Pass 369 stock-period lock verification'
    }, 'module10-pass369-period-block');
    assert.equal(blocked.statusCode, 409, blocked.body);
    assert.equal(errorCode(blocked), 'STOCK_PERIOD_LOCKED');
  });
});

test('Module 10 validation keeps PO quantity, units, stock availability and closed Project state server-authoritative', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app);

    let response = await stockCommand(app, token, '/api/v1/inventory/receipts', receiptPayload({
      items: [{
        poItemId: PURCHASE_ORDER_ITEM_ID,
        itemId: ITEM_ID,
        quantity: '2.0000',
        acceptedQty: '1.0000',
        rejectedQty: '0.0000'
      }]
    }), 'module10-bad-quality-split');
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await stockCommand(app, token, '/api/v1/inventory/receipts', receiptPayload({
      items: [{
        poItemId: PURCHASE_ORDER_UNIT_MISMATCH_ITEM_ID,
        itemId: ITEM_ID,
        quantity: '1.0000',
        acceptedQty: '1.0000',
        rejectedQty: '0.0000'
      }]
    }), 'module10-unit-mismatch');
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'INVALID_UNIT_CONVERSION');

    response = await stockCommand(app, token, '/api/v1/inventory/receipts', receiptPayload(), 'module10-receive-before-overage');
    assert.equal(response.statusCode, 201, response.body);

    response = await stockCommand(app, token, '/api/v1/inventory/receipts', receiptPayload({
      items: [{
        poItemId: PURCHASE_ORDER_ITEM_ID,
        itemId: ITEM_ID,
        quantity: '7.0000',
        acceptedQty: '7.0000',
        rejectedQty: '0.0000'
      }]
    }), 'module10-over-receipt');
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'RECEIPT_EXCEEDS_PO');

    response = await stockCommand(app, token, '/api/v1/inventory/transfers', {
      sourceWarehouseId: CENTRAL_WAREHOUSE_ID,
      destinationWarehouseId: PROJECT_WAREHOUSE_ID,
      itemId: ITEM_ID,
      quantity: '1.0000'
    }, 'module10-insufficient-transfer');
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'INSUFFICIENT_STOCK');

    response = await stockCommand(app, token, '/api/v1/inventory/adjustments', {
      warehouseId: CLOSED_WAREHOUSE_ID,
      itemId: ITEM_ID,
      quantityDelta: '1.0000',
      reason: 'Closed Project probe'
    }, 'module10-closed-project-adjust');
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');
  });
});

test('Module 10 database constraints keep Company/Project scope intact and the stock ledger append-only', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    await assert.rejects(
      () => client.inventoryBalance.create({
        data: {
          warehouseId: PROJECT_WAREHOUSE_ID,
          itemId: FOREIGN_ITEM_ID,
          quantityOnHand: '1.0000',
          reservedQuantity: '0.0000',
          averageCost: '1.0000'
        }
      }),
      /same Company|23514/i
    );

    await assert.rejects(
      () => client.stockTransaction.create({
        data: {
          companyId: COMPANY_ID,
          itemId: ITEM_ID,
          warehouseId: PROJECT_WAREHOUSE_ID,
          projectId: OTHER_PROJECT_ID,
          transactionType: 'ADJUSTMENT',
          quantity: '1.0000',
          unitCost: '1.0000',
          sourceType: 'pass251_scope_probe',
          sourceId: 'scope-probe',
          costStructureId: null,
          occurredAt: new Date()
        }
      }),
      /project-scoped warehouse|23514/i
    );

    const movement = await client.stockTransaction.create({
      data: {
        companyId: COMPANY_ID,
        itemId: ITEM_ID,
        warehouseId: PROJECT_WAREHOUSE_ID,
        projectId: PROJECT_ID,
        transactionType: 'ADJUSTMENT',
        quantity: '1.0000',
        unitCost: '1.0000',
        sourceType: 'pass251_append_only_probe',
        sourceId: 'append-only-probe',
        costStructureId: null,
        occurredAt: new Date()
      }
    });

    await assert.rejects(
      () => client.stockTransaction.update({ where: { id: movement.id }, data: { quantity: '2.0000' } }),
      /append-only|55000/i
    );
    await assert.rejects(
      () => client.stockTransaction.delete({ where: { id: movement.id } }),
      /append-only|55000/i
    );
  });
});

test('Module 10 live OpenAPI preserves source, Pass-368 and Pass-369 operations with strict authority boundaries', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();
    assert.equal(document.openapi, '3.0.3');

    const expected = [
      ['GET', '/api/v1/inventory/items', 'module10ListInventoryItems'],
      ['POST', '/api/v1/inventory/items', 'module10CreateInventoryItem'],
      ['GET', '/api/v1/inventory/items/{id}/unit-conversions', 'module10GetItemUnitConversions'],
      ['PUT', '/api/v1/inventory/items/{id}/unit-conversions', 'module10ReplaceItemUnitConversions'],
      ['POST', '/api/v1/inventory/counts', 'module10CreateInventoryCount'],
      ['GET', '/api/v1/inventory/counts/{id}', 'module10GetInventoryCount'],
      ['POST', '/api/v1/inventory/counts/{id}/reconcile', 'module10ReconcileInventoryCount'],
      ['GET', '/api/v1/inventory/stock-periods', 'module10ListInventoryStockPeriods'],
      ['POST', '/api/v1/inventory/stock-periods', 'module10CreateInventoryStockPeriod'],
      ['POST', '/api/v1/inventory/stock-periods/{id}/lock', 'module10LockInventoryStockPeriod'],
      ['GET', '/api/v1/inventory/balances', 'module10ListInventoryBalances'],
      ['GET', '/api/v1/inventory/warehouses', 'module10Pass368ListWarehouses'],
      ['POST', '/api/v1/inventory/warehouses', 'module10Pass368CreateWarehouse'],
      ['PATCH', '/api/v1/inventory/warehouses/{id}', 'module10Pass368UpdateWarehouse'],
      ['GET', '/api/v1/inventory/stock-ledger', 'module10Pass368ListStockLedger'],
      ['PUT', '/api/v1/inventory/balances/minimum-stock', 'module10Pass368SetMinimumStock'],
      ['GET', '/api/v1/inventory/low-stock', 'module10Pass368ListLowStock'],
      ['POST', '/api/v1/inventory/receipts', 'module10ReceiveInventory'],
      ['POST', '/api/v1/inventory/transfers', 'module10TransferInventory'],
      ['POST', '/api/v1/inventory/issues', 'module10IssueInventory'],
      ['POST', '/api/v1/inventory/returns', 'module10ReturnInventory'],
      ['POST', '/api/v1/inventory/adjustments', 'module10AdjustInventory']
    ];
    const documented = [];
    for (const [method, route, operationId] of expected) {
      const operation = module10OpenApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      documented.push(`${method} ${route}`);
    }

    const actualModule10 = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (pathItem[method]?.operationId?.startsWith('module10')) actualModule10.push(`${method.toUpperCase()} ${route}`);
      }
    }
    assert.deepEqual(actualModule10.sort(), documented.sort());

    for (const route of ['/api/v1/inventory/counts', '/api/v1/inventory/counts/{id}/reconcile', '/api/v1/inventory/receipts', '/api/v1/inventory/transfers', '/api/v1/inventory/issues', '/api/v1/inventory/returns', '/api/v1/inventory/adjustments']) {
      const parameters = module10OpenApiOperation(document, route, 'POST').parameters ?? [];
      const idempotency = parameters.find((parameter) => parameter.in === 'header' && parameter.name === 'idempotency-key');
      assert.ok(idempotency, `${route} must require Idempotency-Key`);
      assert.equal(idempotency.required, true);
    }

    const createBody = module10OpenApiOperation(document, '/api/v1/inventory/items', 'POST')
      .requestBody.content['application/json'].schema;
    assert.equal(createBody.additionalProperties, false);
    for (const field of ['companyId', 'actorUserId', 'status', 'quantityOnHand', 'averageCost']) {
      assert.equal(Object.hasOwn(createBody.properties, field), false, field);
    }

    for (const forbiddenPath of [
      '/api/v1/inventory/ledger',
      '/api/v1/inventory/stock-counts',
      '/api/v1/inventory/valuation',
      '/api/v1/inventory/finance'
    ]) assert.equal(Object.hasOwn(document.paths ?? {}, forbiddenPath), false, forbiddenPath);
  });
});

test('Module 10 transaction rollback removes partial receipt and issue state when a late outbox write fails', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    try {
      await installOutboxFailure(client, 'inventory.received');
      const response = await stockCommand(app, token, '/api/v1/inventory/receipts', receiptPayload(), 'module10-rollback-receipt');
      assert.equal(response.statusCode, 500, response.body);
      assert.equal(await client.goodsReceipt.count({ where: { companyId: COMPANY_ID } }), 0);
      assert.equal(await client.stockTransaction.count({ where: { companyId: COMPANY_ID } }), 0);
      assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'inventory.received' } }), 0);
      assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'inventory.received' } }), 0);
      const line = await client.purchaseOrderItem.findUniqueOrThrow({ where: { id: PURCHASE_ORDER_ITEM_ID } });
      assert.equal(line.receivedQty.toString(), '0');
      const balance = await client.inventoryBalance.findUniqueOrThrow({
        where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } }
      });
      assert.equal(balance.quantityOnHand.toString(), '0');
      const sequence = await client.numberSequence.findFirstOrThrow({ where: { companyId: COMPANY_ID, sequenceKey: 'goods-receipt' } });
      assert.equal(sequence.nextValue, 1n);
    } finally {
      await removeOutboxFailure(client);
    }

    await client.inventoryBalance.update({
      where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } },
      data: { quantityOnHand: '5.0000', averageCost: '10.0000' }
    });

    try {
      await installOutboxFailure(client, 'inventory.issued');
      const response = await stockCommand(app, token, '/api/v1/inventory/issues', {
        warehouseId: PROJECT_WAREHOUSE_ID,
        projectId: PROJECT_ID,
        itemId: ITEM_ID,
        quantity: '2.0000',
        wbsNodeId: WBS_ID,
        costCodeId: COST_CODE_ID,
        costTypeId: COST_TYPE_ID
      }, 'module10-rollback-issue');
      assert.equal(response.statusCode, 500, response.body);
      const balance = await client.inventoryBalance.findUniqueOrThrow({
        where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } }
      });
      assert.equal(balance.quantityOnHand.toString(), '5');
      assert.equal(await client.stockTransaction.count({ where: { companyId: COMPANY_ID } }), 0);
      assert.equal(await client.costActual.count({ where: { companyId: COMPANY_ID, sourceType: 'inventory_issue' } }), 0);
      assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'inventory.issued' } }), 0);
      assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'inventory.issued' } }), 0);
    } finally {
      await removeOutboxFailure(client);
    }
  });
});

// Verify concurrent receipt/issue commands serialize on reviewed locks so PO open quantity and stock availability cannot be over-consumed.
test('Module 10 operational concurrency prevents PO over-receipt and negative Project stock', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const sixUnitReceipt = receiptPayload({
      items: [{
        poItemId: PURCHASE_ORDER_ITEM_ID,
        itemId: ITEM_ID,
        quantity: '6.0000',
        acceptedQty: '6.0000',
        rejectedQty: '0.0000'
      }]
    });

    const receiptResponses = await Promise.all([
      stockCommand(app, token, '/api/v1/inventory/receipts', sixUnitReceipt, 'module10-ops-receipt-a'),
      stockCommand(app, token, '/api/v1/inventory/receipts', sixUnitReceipt, 'module10-ops-receipt-b')
    ]);
    assert.deepEqual(receiptResponses.map((response) => response.statusCode).sort((a, b) => a - b), [201, 409]);
    const failedReceipt = receiptResponses.find((response) => response.statusCode === 409);
    assert.equal(errorCode(failedReceipt), 'RECEIPT_EXCEEDS_PO');

    assert.equal(await client.goodsReceipt.count({ where: { companyId: COMPANY_ID } }), 1);
    assert.equal(await client.stockTransaction.count({
      where: { companyId: COMPANY_ID, warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID, transactionType: 'RECEIPT' }
    }), 1);
    const receivedLine = await client.purchaseOrderItem.findUniqueOrThrow({ where: { id: PURCHASE_ORDER_ITEM_ID } });
    assert.equal(receivedLine.receivedQty.toString(), '6');
    let balance = await client.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } }
    });
    assert.equal(balance.quantityOnHand.toString(), '6');
    const receiptSequence = await client.numberSequence.findFirstOrThrow({
      where: { companyId: COMPANY_ID, sequenceKey: 'goods-receipt' }
    });
    assert.equal(receiptSequence.nextValue, 2n);

    const issuePayload = {
      warehouseId: PROJECT_WAREHOUSE_ID,
      projectId: PROJECT_ID,
      itemId: ITEM_ID,
      quantity: '4.0000',
      wbsNodeId: WBS_ID,
      costCodeId: COST_CODE_ID,
      costTypeId: COST_TYPE_ID
    };
    const issueResponses = await Promise.all([
      stockCommand(app, token, '/api/v1/inventory/issues', issuePayload, 'module10-ops-issue-a'),
      stockCommand(app, token, '/api/v1/inventory/issues', issuePayload, 'module10-ops-issue-b')
    ]);
    assert.deepEqual(issueResponses.map((response) => response.statusCode).sort((a, b) => a - b), [201, 409]);
    const failedIssue = issueResponses.find((response) => response.statusCode === 409);
    assert.equal(errorCode(failedIssue), 'INSUFFICIENT_STOCK');

    balance = await client.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } }
    });
    assert.equal(balance.quantityOnHand.toString(), '2');
    assert.equal(await client.stockTransaction.count({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, itemId: ITEM_ID, transactionType: 'ISSUE' }
    }), 1);
    const actuals = await client.costActual.findMany({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'inventory_issue' }
    });
    assert.equal(actuals.length, 1);
    assert.equal(actuals[0].amount.toString(), '50');

    const ledger = await client.stockTransaction.aggregate({
      where: { companyId: COMPANY_ID, warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID },
      _sum: { quantity: true }
    });
    assert.equal(ledger._sum.quantity?.toString(), '2');
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'inventory.received' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'inventory.issued' } }), 1);
  });
});

// Verify opposing transfers acquire Project and Warehouse/Item locks deterministically, conserve quantity and use reviewed indexes.
test('Module 10 operational opposing transfers conserve stock and reviewed query plans use Stage-15 indexes', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    await client.inventoryBalance.update({
      where: { warehouseId_itemId: { warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID } },
      data: { quantityOnHand: '5.0000', averageCost: '10.0000' }
    });
    await client.inventoryBalance.update({
      where: { warehouseId_itemId: { warehouseId: OTHER_WAREHOUSE_ID, itemId: ITEM_ID } },
      data: { quantityOnHand: '5.0000', averageCost: '9.0000' }
    });

    const transferResponses = await Promise.all([
      stockCommand(app, token, '/api/v1/inventory/transfers', {
        sourceWarehouseId: PROJECT_WAREHOUSE_ID,
        destinationWarehouseId: OTHER_WAREHOUSE_ID,
        itemId: ITEM_ID,
        quantity: '1.0000'
      }, 'module10-ops-transfer-a'),
      stockCommand(app, token, '/api/v1/inventory/transfers', {
        sourceWarehouseId: OTHER_WAREHOUSE_ID,
        destinationWarehouseId: PROJECT_WAREHOUSE_ID,
        itemId: ITEM_ID,
        quantity: '1.0000'
      }, 'module10-ops-transfer-b')
    ]);
    assert.deepEqual(transferResponses.map((response) => response.statusCode), [201, 201]);

    const balances = await client.inventoryBalance.findMany({
      where: { itemId: ITEM_ID, warehouseId: { in: [PROJECT_WAREHOUSE_ID, OTHER_WAREHOUSE_ID] } },
      orderBy: { warehouseId: 'asc' }
    });
    assert.equal(balances.length, 2);
    assert.deepEqual(balances.map((row) => row.quantityOnHand.toString()).sort(), ['5', '5']);
    assert.equal(await client.stockTransaction.count({
      where: { companyId: COMPANY_ID, sourceType: 'inventory_transfer' }
    }), 4);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'inventory.transferred' } }), 2);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'inventory.transferred' } }), 2);

    const projectLedger = await client.stockTransaction.aggregate({
      where: { companyId: COMPANY_ID, warehouseId: PROJECT_WAREHOUSE_ID, itemId: ITEM_ID },
      _sum: { quantity: true }
    });
    const otherLedger = await client.stockTransaction.aggregate({
      where: { companyId: COMPANY_ID, warehouseId: OTHER_WAREHOUSE_ID, itemId: ITEM_ID },
      _sum: { quantity: true }
    });
    assert.equal(projectLedger._sum.quantity?.toString(), '0');
    assert.equal(otherLedger._sum.quantity?.toString(), '0');

    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

      const itemPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM inventory_items
        WHERE company_id = '${COMPANY_ID}'::uuid AND item_code = 'M10-STEEL'
      `));
      assert.match(itemPlan, /inventory_items_company_code_idx/);

      const warehousePlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM warehouses
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND project_id = '${PROJECT_ID}'::uuid
          AND status = 'ACTIVE'
      `));
      assert.match(warehousePlan, /warehouses_company_project_status_idx/);

      const balancePlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM inventory_balances
        WHERE warehouse_id = '${PROJECT_WAREHOUSE_ID}'::uuid
          AND item_id = '${ITEM_ID}'::uuid
      `));
      assert.match(balancePlan, /inventory_balances_warehouse_item_uq/);

      const receiptPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM goods_receipts
        WHERE purchase_order_id = '${PURCHASE_ORDER_ID}'::uuid AND status = 'RECEIVED'
      `));
      assert.match(receiptPlan, /goods_receipts_po_status_idx/);

      const ledgerPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM stock_transactions
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND warehouse_id = '${PROJECT_WAREHOUSE_ID}'::uuid
          AND item_id = '${ITEM_ID}'::uuid
        ORDER BY occurred_at DESC
      `));
      assert.match(ledgerPlan, /stock_transactions_company_warehouse_item_occurred_idx/);

      const sourcePlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM stock_transactions
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND source_type = 'inventory_transfer'
          AND source_id = 'not-present'
      `));
      assert.match(sourcePlan, /stock_transactions_company_source_idx/);
    });
  });
});
