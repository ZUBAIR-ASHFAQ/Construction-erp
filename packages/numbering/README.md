# @construction-erp/numbering

Foundation Pass 13 provides reusable, company-scoped, concurrency-safe business numbering.

## Runtime allocation

`allocateCompanyNumber(tx, { sequenceKey })` requires a Prisma transaction and derives `companyId` only from trusted request security context. It never accepts tenant authority from an HTTP payload.

Allocation is a single PostgreSQL `UPDATE ... RETURNING` against the sequence row. PostgreSQL row locking serializes concurrent allocation and, because the update runs in the caller's business transaction, rollback also rolls back the number allocation.

```text
business transaction
  -> allocate number
  -> create business record with formatted number
  -> audit/outbox if required
  -> COMMIT
```

## Bootstrap provisioning

`ensureProvisionedNumberSequence(tx, ...)` is explicitly for trusted initial-company/bootstrap orchestration, which may exist before Administration can establish an authenticated request context. It accepts an explicit company UUID only at that trusted boundary and must never be wired directly to client input.

Provisioning is idempotent when an existing sequence has the same immutable formatting/increment definition. A conflicting definition raises `NUMBER_SEQUENCE_DEFINITION_CONFLICT` instead of silently changing issued-number behavior.

## Stable error codes

- `INVALID_NUMBER_SEQUENCE_DEFINITION`
- `NUMBER_SEQUENCE_NOT_FOUND`
- `NUMBER_SEQUENCE_INACTIVE`
- `NUMBER_SEQUENCE_EXHAUSTED`
- `NUMBER_SEQUENCE_DEFINITION_CONFLICT`

## Intentional scope

The supplied ERP guide requires Foundation number sequences but does not define fiscal/year resets, gapless legal numbering, per-project counters, or module-specific formats. Pass 13 therefore provides the safe primitive only. Those policies should be introduced by explicit reviewed configuration/migrations rather than assumed here.
