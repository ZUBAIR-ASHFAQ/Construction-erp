# Pass 372 — Module 12 Equipment History, Transfer and Archive Repair

Pass 372 closes repair items M12-03 and M12-04 before Stage 24.

## Scope

- bounded assignment, usage and maintenance history readback;
- atomic Project-to-Project Equipment transfer;
- bodyless archive/dispose lifecycle after open assignments are closed;
- existing `equipment.assign`, `equipment.manage` and `equipment.read` authority only;
- existing `equipment.returned` and `equipment.assigned` outbox vocabulary for transfer;
- no new Prisma table or migration because current Equipment/assignment/history persistence already supports the repair.

## Deliberate boundaries

M12-05 remains `POLICY_REQUIRED`. This pass does not invent rental calendars, idle/fuel costing, maintenance intervals, maintenance work orders, disposal valuation or advanced fleet planning.
