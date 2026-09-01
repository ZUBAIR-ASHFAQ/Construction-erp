import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

async function loadPackages() {
  const testing = await import('@construction-erp/testing');
  const audit = await import('@construction-erp/audit');
  const outbox = await import('@construction-erp/outbox');
  const numbering = await import('@construction-erp/numbering');
  const queue = await import('@construction-erp/queue');
  const tenant = await import('@construction-erp/tenant-scope');
  return { testing, audit, outbox, numbering, queue, tenant };
}

test('Foundation rollback helper leaves no committed company row', { skip: !live }, async () => {
  const { testing } = await loadPackages();
  const environment = testing.loadFoundationTestEnvironment();
  const client = testing.createFoundationTestDatabaseClient(environment);
  try {
    await client.$connect();
    await testing.resetFoundationTestData(client);
    await testing.withRollbackTestTransaction(client, async (tx) => {
      await testing.createTestCompany(tx);
      assert.equal(await tx.company.count(), 1);
    });
    assert.equal(await client.company.count(), 0);
  } finally {
    await client.$disconnect();
  }
});

test('Foundation audit/outbox/numbering/queue writes share trusted tenant context', { skip: !live }, async () => {
  const { testing, audit, outbox, numbering, queue, tenant } = await loadPackages();
  const environment = testing.loadFoundationTestEnvironment();
  const client = testing.createFoundationTestDatabaseClient(environment);
  try {
    await client.$connect();
    await testing.resetFoundationTestData(client);

    await client.$transaction((tx) => testing.createTestCompany(tx));
    await client.numberSequence.create({
      data: {
        companyId: testing.TEST_COMPANY_ID,
        sequenceKey: 'test-document',
        prefix: 'T-',
        padWidth: 4,
        nextValue: 1n,
        incrementBy: 1n,
        status: 'ACTIVE'
      }
    });

    await testing.runWithAuthenticatedTestContext({}, async () => {
      assert.equal(tenant.requireActiveCompanyId(), testing.TEST_COMPANY_ID);
      await client.$transaction(async (tx) => {
        const allocation = await numbering.allocateCompanyNumber(tx, { sequenceKey: 'test-document' });
        assert.equal(allocation.formatted, 'T-0001');
        await audit.recordAudit(tx, {
          entityType: 'foundation-test',
          entityId: 'fixture-1',
          action: 'foundation.tested',
          after: { ok: true, password: 'must-redact' }
        });
        await outbox.recordOutboxEvent(tx, {
          eventType: 'foundation.tested',
          resourceType: 'foundation-test',
          resourceId: 'fixture-1',
          payload: { ok: true, token: 'must-redact' }
        });
        await queue.enqueueJob(tx, {
          queueName: 'foundation',
          jobType: 'foundation.test',
          payload: { ok: true, apiKey: 'must-redact' }
        });
      });
    });

    assert.equal(await client.auditLog.count({ where: { companyId: testing.TEST_COMPANY_ID } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: testing.TEST_COMPANY_ID } }), 1);
    assert.equal(await client.queueJob.count({ where: { companyId: testing.TEST_COMPANY_ID } }), 1);

    const auditRow = await client.auditLog.findFirstOrThrow();
    const outboxRow = await client.outboxEvent.findFirstOrThrow();
    const queueRow = await client.queueJob.findFirstOrThrow();
    assert.notEqual(JSON.stringify(auditRow.afterValue), JSON.stringify({ ok: true, password: 'must-redact' }));
    assert.doesNotMatch(JSON.stringify(outboxRow.payload), /must-redact/);
    assert.doesNotMatch(JSON.stringify(queueRow.payload), /must-redact/);
  } finally {
    await client.$disconnect();
  }
});

test('tenant isolation helper rejects a cross-company record', { skip: !live }, async () => {
  const { testing, tenant } = await loadPackages();
  await testing.runWithAuthenticatedTestContext({}, async () => {
    assert.throws(
      () => tenant.assertOwnedByActiveCompany({ companyId: '00000000-0000-4000-8000-000000000099' }),
      /Cross-company|not available|scope/i
    );
  });
});
