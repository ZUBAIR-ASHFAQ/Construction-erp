# Pass 376 — Module 21 Activity Owner, Derived Duration and Baseline Reopen

Pass 376 closes M21-01 and M21-02 on the exact Pass-375 baseline.

## Activity ownership and duration

- `schedule_activities.owner_user_id` is a nullable historical-compatibility foreign key to `users.id`.
- New Activity creation requires `ownerUserId`.
- The service accepts the owner only when the User is active and has an active membership in the same Project.
- Existing pre-Pass-376 Activities may remain unassigned until edited.
- Planned duration is **derived**, not persisted: elapsed whole UTC calendar days between `planned_start` and `planned_finish`. A same-day milestone therefore has a zero-day span.
- No work calendar, holiday calendar, CPM duration engine or resource-loading policy is invented.

## Baseline reopen / revision lifecycle

Once `baseline_at` is set, planning-structure writes are locked:

- Activity create
- Activity planning update
- dependency replacement
- another baseline creation

Progress remains allowed after baseline.

`POST /api/v1/projects/:projectId/schedule/baseline/reopen` clears only the current `baseline_at` marker. It never updates or deletes `schedule_baselines`. After authorized planning changes, the existing baseline command creates the next immutable baseline number, which is the controlled revised baseline.

The repair reuses `schedule.baseline`, `SCHEDULE_BASELINE_LOCKED`, existing audit infrastructure and existing baseline persistence. No new permission, stable error or domain event is introduced.

M21-03 remains out of scope. M21-04 remains deferred to Stage 27.
