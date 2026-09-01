# Pass 409 — Current Static-Test / Historical Assertion Supersession Hygiene

## Purpose

Pass 409 repairs only the cumulative static-test maintenance problem frozen by Pass 408 as `A408-01 / REPAIR_PASS_409`.

The exact Pass-408 production runtime remains unchanged. This pass does not alter application behavior, Prisma schema, migrations, repository logic, service logic, HTTP routes, React behavior, permissions, stable errors, events, workers, configuration or Stage-25 code.

## Why the static runner was red

The maintained dependency-free static runner intentionally executes every top-level `tests/*.test.mjs` file that does not require built packages. That runner was correct and remains unchanged.

The problem was inside historical pass-local tests. Passes 390–405 intentionally recorded temporary boundaries such as:

- RFI persistence/routes/detail readback did not exist yet;
- only four Submittal routes existed;
- later RFI service/routes/UI/navigation work was still deferred;
- a prior production snapshot hash had to remain exact;
- Pass 406 was still the next planned step.

Later approved passes intentionally superseded those temporary absence/defer conditions. Treating the old assertions as present-day regression requirements caused the current static suite to fail even though the later Module-19 implementation is accepted by the current cumulative gates.

## Repair decision

Pass 409 follows the same test-only supersession pattern already used earlier in the project:

1. Keep every historical test file in the repository.
2. Keep the maintained static runner scanning those files; do not hide whole files from the runner.
3. Mark only the specific assertions whose historical precondition was intentionally superseded as `test.skip(...)`.
4. Keep all still-valid assertions in those files active.
5. Update the stale centralized Prisma model-list assertion to the actual reviewed Stage-24 schema by adding `Rfi` and `RfiResponse`.
6. Mark the Pass-408 pre-repair characterization assertion as historical after the repair it described is completed.
7. Repair one latent Pass-395 verification ordering issue by loading its own test source before tests can execute.

No current Module-19 feature is removed or weakened.

## Exact supersession set

The original Pass-408 current-static run had 29 failures. Twenty-eight were historical Module-19 pass-local assertions. They are now explicitly skipped in place:

- Pass 390: 1 assertion.
- Pass 392: 4 assertions.
- Pass 393: 1 assertion.
- Pass 394: 4 assertions.
- Pass 395: 2 assertions.
- Pass 396: 3 assertions.
- Pass 397: 2 assertions.
- Pass 398: 2 assertions.
- Pass 399: 4 assertions.
- Pass 400: 1 assertion.
- Pass 402: 1 assertion.
- Pass 403: 1 assertion.
- Pass 404: 1 assertion.
- Pass 405: 1 assertion.

The twenty-ninth original failure was the stale exact Prisma model list in `tests/database.test.mjs`. That current infrastructure assertion remains active and is corrected to include the two reviewed RFI models.

After that correction, the Pass-408 test that specifically asserted the stale pre-repair database/test state became historical by design. Pass 409 therefore marks only that one Pass-408 characterization assertion skipped while leaving all other Pass-408 freeze checks active.

## Coverage deliberately retained

Pass 409 does **not** exclude Pass-390→405 files from `scripts/testing/run-static.mjs`. Current positive checks, current security checks, current schema/repository/service assertions and all later Pass-401/406/407/408 cumulative acceptance checks continue to run.

The current authoritative Module-19 boundary remains covered by:

- Pass 401 detail/history readback checks;
- Pass 406 Playwright workflow source checks;
- Pass 407 Stage-24 final audit checks;
- Pass 408 Stage-0→24 cumulative freeze checks;
- migration-system and workspace guards;
- the complete maintained dependency-free static runner.

## Result

The maintained static runner is green again without reverting production behavior:

```text
Tests       3030
Passed      2970
Failed         0
Skipped       60
```

The skip increase from 31 to 60 is intentional: 28 obsolete Pass-390→405 assertions plus the now-superseded Pass-408 pre-repair characterization are retained as explicit historical evidence instead of being deleted.

## Production boundary

Pass 409 changes no file under:

- `apps/`;
- `packages/`;
- `docker/`;
- `docker-compose.yml`;
- `tsconfig.base.json`;
- `eslint.config.mjs`;
- `playwright.config.mjs`.

The accepted production snapshot remains:

`d63da857e5dbc43585188139cb80ae77b35a415ae01ef876b7132c6335111494`

## Next repair

Pass 410 is **Procurement Runtime Config Wiring Repair** for `A408-02`.

Stage 25 / Module 20 remains blocked until the complete Pass-408 repair program reaches the final Stage-0→24 acceptance handoff.
