# Pass B15.7 - Final-21 Site Expense Evidence and Documents Integration

## Purpose

Pass B15.7 completes the backend evidence/document integration for Final Module 14 - Site Expense Management before React work begins.

The Final-21 contract requires Site Expenses to support an optional evidence document, while Module 21 remains the owner of secure upload/version/link/download behavior. This pass therefore connects Site Expense to the existing Documents & Audit resource-link authorization model instead of adding another file-storage path.

## Changes

### 1. Site Expense is an allow-listed Module 21 resource

`DOCUMENT_LINK_RESOURCE_TYPES` now includes:

- `site_expense`

The existing `POST /api/v1/documents/:id/links` and controlled unlink route can therefore attach/detach a Document link to a Site Expense without introducing Site Expense-specific document endpoints.

### 2. Same-company resource resolution

`DocumentsRepository.findLinkableResource()` now resolves `site_expense` through the trusted company repository scope.

The resolved link dimensions are taken from the persisted Site Expense:

- `id`
- `projectId`
- optional `stageId`

This prevents browser-supplied Project or Stage ownership from becoming authoritative.

### 3. Resource authorization

Before a document may be linked to or unlinked from a Site Expense, Module 21 now requires `site_expenses.read` either:

- as a company-level effective permission in the authenticated request context; or
- as an effective permission for the exact Site Expense Project.

Normal `documents.link` authority and authenticated Project membership remain required as well.

A Project-scoped Document cannot be linked to a Site Expense from a different Project.

### 4. Primary evidence validation

The Site Expense repository already validates the optional `documentId` through Module 21-owned Document records. B15.7 tightens that lookup so only an `active` same-company Document is accepted when it belongs to, or is already linked inside, the Site Expense Project.

No binary data is stored in `site_expenses`; the row continues to store only the Document ID.

## Deliberately not added

B15.7 does not add:

- another Prisma model or migration;
- a Site Expense file/blob column;
- public/permanent file URLs;
- duplicate upload/download routes;
- generic Site Expense CRUD routes;
- a new approval workflow;
- React Site Expense pages;
- direct Profitability writes.

Module 21 remains the owner of signed storage access and document-link history.

## Verification target

B15.7 is complete when:

1. `site_expense` is a strict Module 21 link resource type;
2. its target is resolved in authenticated company scope;
3. Project/Stage ownership comes from the persisted Site Expense;
4. link/unlink operations require Site Expense read authority plus Documents link authority;
5. cross-Project links are rejected;
6. the direct Site Expense evidence Document must be active and Project-authorized;
7. no new migration, Site Expense route, or React scope is introduced.

Next pass: **B15.8 - Site Expense React API/hooks/pages/components and route/navigation integration.**

## Verification completed

- cumulative B15.1-B15.7 focused tests: **64/64 PASS**;
- complete `final-21-*` static regression: **240/240 PASS**;
- workspace structure check: **PASS**;
- Final-21 legacy cleanup manifest check: **PASS**;
- migration-system tests: **8/8 PASS**;
- migration policy: **81/81 migrations locked across 81 gates**.

The source archive does not contain installed `node_modules`, so dependency-backed Prisma generation, Fastify compilation, PostgreSQL integration, and browser execution are not claimed in this pass.
