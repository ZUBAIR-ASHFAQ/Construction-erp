# Pass 371 — Module 12 Equipment Usage Approval + Exactly-Once Job Cost

Pass 371 closes frozen repair items M12-01 and M12-02 before Stage 24. It preserves the seven source-reviewed Stage-17 Equipment operations and adds only two bodyless repair commands for recorded usage approval and Project actual-cost posting.

## Repair contract

1. New usage records require a concrete Project cost-structure ID and start in server-owned `RECORDED` state.
2. `POST /api/v1/equipment/:id/usage/:usageId/submit` reuses the existing `equipment.usage` authority and a configured `EQUIPMENT_USAGE_APPROVAL_DEFINITION_CODE`.
3. Module 22 owns approval actions. Browser input cannot send approval status, approver identity, cost amount, source keys or posting state.
4. `POST /api/v1/equipment/:id/usage/:usageId/post-cost` succeeds only after the reusable approval request is `APPROVED`.
5. Project actual cost uses stable source identity `EQUIPMENT_USAGE + equipmentId + usageId`; the Module-7 unique source key makes retries exactly once.
6. The service revalidates the cost structure as same-Project, same-Company, active and posting-enabled before creating the actual.
7. Usage becomes `POSTED` in the same transaction as the Module-7 actual and is database-protected from later update/delete.
8. No new Module-12 permission, stable error, domain event, business module, Finance adapter, owned/rented formula, transfer/archive workflow or history read API is added.

M12-03/M12-04 remain Pass 372. M12-05 remains policy-required.
