# @construction-erp/testing

Reusable Foundation test infrastructure for Stage 0 and later ERP module gates.

It deliberately separates three concerns:

1. **Static/unit tests** — no database required.
2. **Disposable database integration tests** — require a database name clearly marked as a test database plus an explicit destructive confirmation token.
3. **Rollback-scoped tests** — assertions run inside a Prisma transaction that is always rolled back after success.

## Safety contract

Live database tests require both:

```text
TEST_DATABASE_URL=postgresql://.../construction_erp_foundation_test?schema=public
TEST_DATABASE_CONFIRM=RESET_CONSTRUCTION_ERP_TEST_DATABASE
```

The helper refuses the production/default `construction_erp` database and PostgreSQL system databases.

## Core helpers

```text
loadFoundationTestEnvironment()
createFoundationTestDatabaseClient()
resetFoundationTestData()
withRollbackTestTransaction()
createDeterministicTestRequestContext()
runWithAuthenticatedTestContext()
createTestCompany()
```

Test request context is deterministic and server-owned. It does not weaken the production tenant-isolation contract.
