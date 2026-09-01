# Pass B15.2 - Final-21 Site Expense Persistence

## Purpose

Pass B15.2 implements only the database persistence baseline for Final Module 14 - Site Expense Management. It follows the B15.1 dependency audit and intentionally does not add Zod schemas, repositories, services, Fastify routes, permissions, React UI, posting logic, reversal logic, or document-link resource handling yet.

The controlling Module 14 persistence is limited to `expense_categories` and `site_expenses`.

## Prisma models added

### `ExpenseCategory`

Fields:

- `id`
- `companyId`
- `code`
- `name`
- `defaultGlAccountId` nullable
- `status`

Integrity:

- category code is unique inside one Company
- optional default GL account must belong to the same Company
- Company/status/name and default-GL indexes support later bounded reads

### `SiteExpense`

Fields:

- `id`
- `companyId`
- `projectId`
- `stageId` nullable
- `expenseNo`
- `expenseDate`
- `categoryId`
- `description`
- `amount`
- `paymentMode`
- `cashBankAccountId` nullable
- `status`
- `documentId` nullable
- `createdBy`
- `postedAt` nullable

Integrity:

- Project must belong to the same Company
- optional Stage must belong to the selected Project
- category must belong to the same Company
- optional Cash/Bank account must belong to the same Company
- optional Document must belong to the same Company
- creator must belong to the same Company
- expense number is unique inside one Company
- amount is precise `DECIMAL(18,2)` and database-constrained to be positive
- required business strings are database-constrained to be non-blank

## Migration

Added one forward-only migration:

`20260829001900_final21_site_expenses`

Historical migrations were not edited. The migration creates only the two Final Module 14 tables, their foreign keys, checks and indexes. It does not seed unsupported category/status/payment vocabularies and does not add permissions or runtime behavior.

The migration gate/checksum manifests were extended with the new migration. Existing checksum locks remain unchanged.

## Deliberately deferred to B15.3+

The following are intentionally not implemented in B15.2:

- `/api/v1/site-expenses` routes
- Site Expense backend five-file module
- Zod request/response schemas
- permission/error/event vocabulary
- cash/bank payment-mode business validation
- posting to Finance
- posting `site_expense` actual cost to Module 9
- idempotent post/reverse commands
- audit/outbox behavior
- `site_expense` Document link resource type
- React feature

## Verification

B15.2 adds focused static tests covering exact persistence shape, same-company relationships, migration constraints/indexes, runtime deferral and migration-lock registration.

Dependency-backed Prisma generation/validation is still required when dependencies are installed. The provided archive does not include `node_modules`, so B15.2 does not claim an installed-dependency Prisma CLI gate.

## Exit decision

B15.2 is complete when the two Prisma models, one forward migration, migration lock metadata and focused regression tests pass while the Site Expense runtime remains absent.

Next pass: **B15.3 - add Site Expense Zod boundary schemas, stable permissions and stable error vocabulary only.**
