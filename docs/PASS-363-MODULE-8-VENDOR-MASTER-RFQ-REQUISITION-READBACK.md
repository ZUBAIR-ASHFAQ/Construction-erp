# Pass 363 — Module 8 Vendor Master + Durable RFQ/Requisition Readback

## Purpose

Pass 363 closes frozen repair items **M8-02** and **M8-03** on top of Pass 362. The controlling requirements make Module 8 the Vendor master owner, while the original Appendix route table leaves the public Vendor-management and durable RFQ/requisition recovery shapes unspecified. This pass therefore records and implements the smallest reviewed amendment needed for real Procurement operation.

## Implemented boundary

The original eight Stage-13 Module-8 operations remain unchanged. Pass 363 adds 11 repair operations for Vendor/contact maintenance, requisition detail/revision and RFQ list/detail readback. It adds no generic DELETE endpoint and no RFQ-item CRUD subsystem.

Vendor lifecycle is deliberately non-destructive: `ACTIVE -> ARCHIVED -> ACTIVE`. Vendor create/update/archive/restore and contact maintenance reuse `procurement.rfq.manage`; RFQ invitation/quotation eligibility remains server-owned and requires active/qualified Vendor state.

The controlled requisition revision command accepts only `requiredDate`, `purpose`, exact line business fields and mandatory `reason`. The server derives Company/actor/state, requires the original requester plus `procurement.pr.create`, locks and revalidates the Project and requisition, allows only `SUBMITTED`, `RETURNED` or `REJECTED`, refuses revision once an RFQ references the requisition, revalidates Module-6 posting combinations, returns the revised source to `DRAFT`, and writes audit evidence.

Durable readback now includes one requisition detail endpoint plus bounded RFQ list/detail endpoints. React uses those server reads so Vendor invitation and RFQ continuation survive browser reload. The existing requisition editor is reused for controlled revision rather than adding another form subsystem.

## Explicit non-goals

Pass 363 does not add a database table, migration, permission, stable error family, domain event, Purchase Order conversion, financial commitment, journal, payable, Stage-26 Finance adapter, Stage-27 integration, supplier scoring engine, arbitrary RFQ-item CRUD or generic Procurement CRUD.

## Code-quality rule

Implementation stays inside the existing Module-8 five-file backend and existing four-file React feature. New named functions have short purpose comments. Repository functions remain persistence-focused; lifecycle authority and permission checks stay in the service.

## Next reviewed repair

**Pass 364 — Module 9 Direct Purchase exception workflow.**
