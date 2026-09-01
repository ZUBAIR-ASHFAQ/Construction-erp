# @construction-erp/tenant-scope

Foundation Pass 07 repository guards for single-company request isolation.

The corrected execution contract requires repository methods to derive
`company_id` from authenticated context, reject cross-company reads/writes, and
cover the behavior with negative tests. This package provides the reusable
primitives. It does not authenticate users; Administration will populate the
trusted request security context.

## Repository pattern

```ts
const scope = requireCompanyRepositoryScope();

const row = await prisma.someCompanyOwnedModel.findFirst({
  where: scope.where({ id })
});

const created = await prisma.someCompanyOwnedModel.create({
  data: scope.createData({ name })
});
```

The caller must not provide `companyId`. Both TypeScript types and runtime
checks reject it. Reads/updates/deletes must include the top-level company
predicate so an identifier from another company behaves as unavailable rather
than becoming an authorization oracle.

For records loaded by trusted server code (for example, within a transaction),
`scope.assertOwned(record)` provides an explicit defensive ownership check.

## Boundaries

- `companies` is the Foundation tenant root; these helpers are for future rows
  that carry `companyId`.
- No project-scope policy is activated in this pass. Project scope remains
  `not-resolved` until Administration can resolve explicit Project scope.
- Pass 08 will provide the common application/API error framework. The error
  classes in this package are internal guard errors, not stable HTTP contracts.
