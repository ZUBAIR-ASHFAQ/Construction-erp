# Pass 377 — Module 17 Change Request Withdraw + Immutable History

## Purpose

Close M17-01 only. The controlling workflow says rejected and withdrawn Change Requests remain historical, but the original reviewed route table had reject and no withdraw command.

## Implemented repair

- Adds `POST /api/v1/change-orders/requests/:id/withdraw`.
- Accepts only `{ reason }`; Company, Project scope, actor, timestamp and status remain server-owned.
- Reuses existing `changes.submit` lifecycle authority instead of inventing `changes.withdraw`.
- Allows withdrawal only from `DRAFT` or `SUBMITTED`.
- Persists `withdraw_reason`, `withdrawn_by` and `withdrawn_at` on the existing Change Request row.
- Uses a Company-safe composite FK from `withdrawn_by + company_id` to `users`.
- PostgreSQL blocks UPDATE/DELETE after a Change Request reaches `WITHDRAWN`.
- Keeps estimate lines and any existing Module-22 approval evidence historical.
- Creates no formal Change Order and applies no Budget, Client Contract, Subcontract or Schedule impact.
- Records a Foundation audit action `change_request.withdrawn`; no new source domain event is invented.
- React shows the terminal withdrawal evidence and provides the reason-bearing command.

## Deliberately deferred

- Exact Change type/status vocabularies remain policy-required.
- Client Contract, Subcontract and Schedule target adapters remain Stage 27.
- Reversal of already-applied Change impacts remains Stage 27 policy/integration work.
- No generic Change detail, PATCH, DELETE, apply, reopen or revise route is added.

## Simplicity

The existing five-file backend module remains unchanged in shape. No helper/service/repository subsystem or new business table is introduced.
