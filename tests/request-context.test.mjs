import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindRequestSecurityContext,
  createRequestContext,
  getRequestContext,
  hasPermission,
  normalizeCorrelationId,
  requireCompanyId,
  requireRequestContext,
  requireRequestSecurityContext,
  runWithRequestContext
} from '../packages/request-context/dist/index.js';

test('Foundation creates a server request ID and safe correlation ID', () => {
  const context = createRequestContext({ correlationId: 'gateway-123' });
  assert.match(context.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(context.correlationId, 'gateway-123');
  assert.equal(context.security, null);
});

test('invalid client correlation data is discarded', () => {
  assert.equal(normalizeCorrelationId('contains spaces and\nnewline'), undefined);
  assert.equal(normalizeCorrelationId('x'.repeat(129)), undefined);

  const context = createRequestContext({ correlationId: 'contains spaces' });
  assert.equal(context.correlationId, context.requestId);
});

test('AsyncLocalStorage exposes the active request without global leakage', async () => {
  const a = createRequestContext({ correlationId: 'A' });
  const b = createRequestContext({ correlationId: 'B' });

  const [seenA, seenB] = await Promise.all([
    runWithRequestContext(a, async () => {
      await new Promise((resolve) => setTimeout(resolve, 8));
      return getRequestContext()?.correlationId;
    }),
    runWithRequestContext(b, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return getRequestContext()?.correlationId;
    })
  ]);

  assert.equal(seenA, 'A');
  assert.equal(seenB, 'B');
  assert.equal(getRequestContext(), undefined);
});

test('trusted security context is bound once and normalized', () => {
  const context = createRequestContext();

  runWithRequestContext(context, () => {
    const security = bindRequestSecurityContext({
      actorUserId: ' user-1 ',
      companyId: ' company-1 ',
      permissions: ['projects.read', 'users.read', 'projects.read'],
      projectScope: { kind: 'restricted', projectIds: ['p-2', 'p-1', 'p-2'] }
    });

    assert.equal(requireCompanyId(), 'company-1');
    assert.deepEqual(security.permissions, ['projects.read', 'users.read']);
    assert.deepEqual(security.projectScope, { kind: 'restricted', projectIds: ['p-1', 'p-2'] });
    assert.equal(hasPermission('users.read'), true);
    assert.equal(hasPermission('finance.post'), false);
    assert.equal(context.security, security);

    assert.throws(
      () => bindRequestSecurityContext({
        actorUserId: 'other',
        companyId: 'other-company',
        permissions: [],
        projectScope: { kind: 'not-resolved' }
      }),
      /already bound/
    );
  });
});

test('authenticated/company helpers fail outside a resolved request context', () => {
  assert.throws(() => requireRequestContext(), /No request context is active/);
  const context = createRequestContext();
  runWithRequestContext(context, () => {
    assert.throws(() => requireRequestSecurityContext(), /Authenticated request security context is required/);
  });
});
