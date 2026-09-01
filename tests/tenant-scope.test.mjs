import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindRequestSecurityContext,
  createRequestContext,
  runWithRequestContext
} from '../packages/request-context/dist/index.js';
import {
  CrossCompanyAccessError,
  UntrustedCompanyScopeInputError,
  assertOwnedByActiveCompany,
  companyScopedCreateData,
  companyScopedWhere,
  requireCompanyRepositoryScope
} from '../packages/tenant-scope/dist/index.js';

function authenticatedRequest(companyId) {
  const context = createRequestContext();
  return {
    context,
    bind() {
      return bindRequestSecurityContext({
        actorUserId: `actor-${companyId}`,
        companyId,
        permissions: [],
        projectScope: { kind: 'not-resolved' }
      });
    }
  };
}

test('company scope cannot be resolved without authenticated request security', () => {
  const context = createRequestContext();
  runWithRequestContext(context, () => {
    assert.throws(() => companyScopedWhere({ id: 'record-1' }), /Authenticated request security context is required/);
  });
});

test('repository where clauses always receive the trusted company from context', () => {
  const request = authenticatedRequest('company-a');
  runWithRequestContext(request.context, () => {
    request.bind();
    assert.deepEqual(companyScopedWhere({ id: 'r-1', status: 'ACTIVE' }), {
      id: 'r-1',
      status: 'ACTIVE',
      companyId: 'company-a'
    });
  });
});

test('create data is stamped with companyId and caller ownership is rejected', () => {
  const request = authenticatedRequest('company-a');
  runWithRequestContext(request.context, () => {
    request.bind();
    assert.deepEqual(companyScopedCreateData({ name: 'Owned row' }), {
      name: 'Owned row',
      companyId: 'company-a'
    });

    assert.throws(
      () => companyScopedCreateData({ name: 'bad', companyId: 'company-b' }),
      UntrustedCompanyScopeInputError
    );
    assert.throws(
      () => companyScopedWhere({ id: 'r-1', companyId: 'company-a' }),
      UntrustedCompanyScopeInputError
    );
  });
});

test('defensive ownership guard rejects a cross-company record without leaking identifiers', () => {
  const request = authenticatedRequest('company-a');
  runWithRequestContext(request.context, () => {
    request.bind();
    assert.equal(assertOwnedByActiveCompany({ id: 'a', companyId: 'company-a' }).id, 'a');

    assert.throws(
      () => assertOwnedByActiveCompany({ id: 'b', companyId: 'company-b' }),
      (error) => {
        assert.equal(error instanceof CrossCompanyAccessError, true);
        assert.equal(error.message.includes('company-a'), false);
        assert.equal(error.message.includes('company-b'), false);
        return true;
      }
    );
  });
});

test('negative cross-company read/write example is blocked by the same scoped repository filter', () => {
  const records = [
    { id: 'shared-looking-id-a', companyId: 'company-a', value: 10 },
    { id: 'target-b', companyId: 'company-b', value: 20 }
  ];

  function findById(id) {
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({ id });
    return records.find((row) => row.id === where.id && row.companyId === where.companyId) ?? null;
  }

  function updateById(id, value) {
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({ id });
    const row = records.find((candidate) => candidate.id === where.id && candidate.companyId === where.companyId);
    if (!row) return null;
    row.value = value;
    return row;
  }

  const request = authenticatedRequest('company-a');
  runWithRequestContext(request.context, () => {
    request.bind();
    assert.equal(findById('target-b'), null);
    assert.equal(updateById('target-b', 999), null);
    assert.equal(records[1].value, 20);
  });
});

test('concurrent company contexts do not leak tenant predicates', async () => {
  const a = authenticatedRequest('company-a');
  const b = authenticatedRequest('company-b');

  const [whereA, whereB] = await Promise.all([
    runWithRequestContext(a.context, async () => {
      a.bind();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return companyScopedWhere({ id: 'x' });
    }),
    runWithRequestContext(b.context, async () => {
      b.bind();
      await new Promise((resolve) => setTimeout(resolve, 1));
      return companyScopedWhere({ id: 'x' });
    })
  ]);

  assert.equal(whereA.companyId, 'company-a');
  assert.equal(whereB.companyId, 'company-b');
});
