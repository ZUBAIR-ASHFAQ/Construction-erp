# Stage 2 - Pass 2.7: Numbering + Storage Hardening

## Scope

This pass hardens only Foundation business numbering and object-storage safety. It does not add or redesign a business module.

## Findings

- Number allocation was already company-scoped, transaction-bound, concurrency-safe, and rollback-safe.
- Initial bootstrap could still accept a sequence set that omitted final ERP document families such as Project, client receipt, or supplier payment.
- Document uploads already used company-rooted opaque storage keys, private S3-compatible storage, non-overwriting writes, and short-lived signed URLs.
- Persisted document storage keys were trusted when a later download or upload-completion check used them. A corrupted row could therefore point at another company's object key before signing or inspecting it.
- Document persistence stores metadata and storage keys, not file binary bodies.

## Changes

1. Added a small Foundation required-sequence list for:
   - `project`
   - `purchase-order`
   - `client-invoice`
   - `client-receipt`
   - `supplier-payment`
2. Initial bootstrap now rejects an input that omits any of those required sequence families. Formatting remains deployment-controlled; no prefix format was invented.
3. Added `assertCompanyObjectKey()` to re-check a persisted storage key against authenticated company scope.
4. Document download signing and upload-completion verification now use that company-key check before touching object storage.
5. Updated the existing Module 24A live-test bootstrap fixtures to satisfy the strengthened Foundation bootstrap contract.
6. Added focused static regression coverage. No migration or new abstraction was required.

## Verification

- Focused numbering/bootstrap/storage tests: 34 passed, 0 failed.
- Full static suite: 3,021 passed, 0 failed, 87 skipped.
- Foundation static gate: 8 passed, 0 failed.
- Workspace/function-purpose-comment check: passed.
- TypeScript syntax checks for edited production files: passed.
- Full workspace typecheck remains blocked because dependencies and generated Prisma types are not installed in this environment.

## Result

Pass 2.7 is complete for static Foundation verification. Live S3/database proof remains part of the later live environment gate.
