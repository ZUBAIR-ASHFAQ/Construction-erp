import {
  bindRequestSecurityContext,
  createRequestContext,
  runWithRequestContext,
  type ProjectScope,
  type RequestContext
} from '@construction-erp/request-context';

export const TEST_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000001';
export const TEST_COMPANY_ID = '00000000-0000-4000-8000-000000000002';
export const TEST_STARTED_AT = new Date('2026-01-01T00:00:00.000Z');

export type TestRequestContextInput = Readonly<{
  requestId?: string;
  correlationId?: string;
  actorUserId?: string;
  companyId?: string;
  permissions?: readonly string[];
  projectScope?: ProjectScope;
}>;

/** Create deterministic test request context. */
export function createDeterministicTestRequestContext(input: TestRequestContextInput = {}): RequestContext {
  return createRequestContext({
    requestId: input.requestId ?? 'test-request-0001',
    correlationId: input.correlationId ?? 'test-correlation-0001',
    startedAt: TEST_STARTED_AT
  });
}

/** Run with authenticated test context. */
export async function runWithAuthenticatedTestContext<T>(
  input: TestRequestContextInput,
  work: () => Promise<T> | T
): Promise<T> {
  const context = createDeterministicTestRequestContext(input);
  return runWithRequestContext(context, async () => {
    bindRequestSecurityContext({
      actorUserId: input.actorUserId ?? TEST_ACTOR_USER_ID,
      companyId: input.companyId ?? TEST_COMPANY_ID,
      permissions: input.permissions ?? [],
      projectScope: input.projectScope ?? { kind: 'not-resolved' }
    });
    return work();
  });
}
