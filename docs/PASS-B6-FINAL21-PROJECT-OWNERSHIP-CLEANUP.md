# Pass B6 — Final-21 Project Management Ownership Cleanup

## Purpose

Keep Final Module 6 Project Management responsible only for the Project master, commercial model/value, dates, manager/location and controlled lifecycle. Employee Project/stage assignment belongs to Final Module 8.

## Implemented

- Removed `PUT /api/v1/projects/:id/members` from the active API.
- Removed Project member schemas, repository methods, service logic, audit/outbox handling and React member editing.
- Removed `projects.manage_members` from the Project permission contract and classified it as a removed legacy permission in Administration.
- Project detail now returns only the Project plus append-only status history.
- Added distinct `projects.complete` permission to match the Final-21 Project contract.
- Suspend requires `projects.update`; complete requires `projects.complete`; close requires `projects.close`.
- Replaced old Stage/Module-24B naming in the active Project module with Final Module 6/Project terminology.
- Removed obsolete Module-24B verification scripts, tests and package commands.
- Kept historical migrations unchanged.

## Legacy data bridge

The existing `project_members` table/model is deliberately retained only until Pass B8. It may contain useful historical assignment data. Active Project Management does not read or write it. Pass B8 will migrate valid employee/project assignment data into Final Module 8 before the legacy persistence is removed.

## Exit condition

Project Management has no Project-team mutation API or business logic. The next implementation pass can build Project Stages without inheriting the old User-membership ownership model.
