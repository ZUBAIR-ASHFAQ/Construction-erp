# Final 21-Module Legacy Cleanup Manifest

Generated from the current repository by `scripts/final-21/build-legacy-cleanup-manifest.mjs`.

## Inventory rules

- This manifest reports the current repository state. Cleanup passes may delete obsolete source files, but historical migrations remain immutable.
- The Final 21-Module Merged Requirements are controlling. CRM opportunities, Tender/Estimate/Proposal, standalone Contract, BOQ, WBS/Cost Codes, RFQ, standalone Approval Workflows, Change Orders, RFI/Submittals, and Project Scheduling are excluded as standalone business modules.
- Minimal status approval, stage dates/progress evidence, documents, and controlled commands remain owned by their final modules.
- Historical migrations stay immutable; obsolete tables are removed only through later forward migrations after replacement data paths exist.

## Decision legend

- **DELETE**: obsolete final-scope behavior; remove only after its consumers are disconnected.
- **MOVE**: reusable logic belongs in another final module. Move first, prove the replacement, then delete the old copy.
- **KEEP**: behavior belongs to the final owner, although fields/routes may still need contract refactoring.
- **REVIEW**: file contains mixed concerns or a cross-cutting dependency that must be handled before deletion.

## High-level removal order

1. Disconnect Approval service consumers and replace each with module-owned status commands.
2. Remove CRM Opportunity, Tender/Estimate, BOQ, WBS/Cost Code, RFQ/Quotation, Scheduling, Change Order, and RFI/Submittal code paths.
3. Move vendor/subcontractor master behavior to Final Module 5.
4. Move Purchase Order behavior into Final Module 10 Procurement / Purchase.
5. Split employee master from payroll, and project assignments from timesheets.
6. Remove Project tender/member coupling, Budget WBS coupling, and Client Billing contract/BOQ coupling.
7. Only after replacements are proven, create forward migrations that remove obsolete tables/relations.

## A. Standalone modules marked DELETE

### approvals

Decision: **DELETE** the standalone module after downstream dependencies are removed. Current state: backend removed, frontend removed.

**Files**

**Current routes**
- None found

**Named functions/components**
- None found

### tendering-estimation

Decision: **DELETE** the standalone module after downstream dependencies are removed. Current state: backend removed, frontend removed.

**Files**

**Current routes**
- None found

**Named functions/components**
- None found

### boq

Decision: **DELETE** the standalone module after downstream dependencies are removed. Current state: backend removed, frontend removed.

**Files**

**Current routes**
- None found

**Named functions/components**
- None found

### wbs-cost-codes

Decision: **DELETE** the standalone module after downstream dependencies are removed. Current state: backend removed, frontend removed.

**Files**

**Current routes**
- None found

**Named functions/components**
- None found

### scheduling

Decision: **DELETE** the standalone module after downstream dependencies are removed. Current state: backend removed, frontend removed.

**Files**

**Current routes**
- None found

**Named functions/components**
- None found

### change-orders

Decision: **DELETE** the standalone module after downstream dependencies are removed. Current state: backend removed, frontend removed.

**Files**

**Current routes**
- None found

**Named functions/components**
- None found

### rfi-submittals

Decision: **DELETE** the standalone module after downstream dependencies are removed. Current state: backend removed, frontend removed.

**Files**

**Current routes**
- None found

**Named functions/components**
- None found

## B. Mixed modules requiring MOVE / KEEP / DELETE split

### clients

Decision: **MIXED**. Keep only final-scope behavior; move reusable logic to its final owner and delete obsolete workflow logic in later passes.

**Files requiring split/refactor review**
- REVIEW `apps/api/src/modules/clients/clients.repository.ts`
- REVIEW `apps/api/src/modules/clients/clients.routes.ts`
- REVIEW `apps/api/src/modules/clients/clients.schema.ts`
- REVIEW `apps/api/src/modules/clients/clients.service.ts`
- REVIEW `apps/api/src/modules/clients/index.ts`
- REVIEW `apps/web/src/features/clients/api/clients-api.ts`
- REVIEW `apps/web/src/features/clients/components/client-details-panel.tsx`
- REVIEW `apps/web/src/features/clients/hooks/clients.ts`
- REVIEW `apps/web/src/features/clients/pages/clients-page.tsx`

**Current routes to reconcile**
- REVIEW `GET /api/v1/clients`
- REVIEW `POST /api/v1/clients`
- REVIEW `GET /api/v1/clients/:id`
- REVIEW `PATCH /api/v1/clients/:id`
- REVIEW `POST /api/v1/clients/:id/contacts`
- REVIEW `PATCH /api/v1/clients/:id/contacts/:contactId`

**Named function/component decisions**
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: assertPageWindow` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: constructor` → Review in owning final module
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: listClients` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: findClientById` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: findClientByCode` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: createClient` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: updateClient` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: listClientContacts` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: findClientContact` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: createClientContact` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: updateClientContact` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.repository.ts :: getClientSummary` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.routes.ts :: requireRoutePermission` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.routes.ts :: registerClientsRoutes` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.schema.ts :: createClientError` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.service.ts :: constructor` → Review in owning final module
- KEEP `apps/api/src/modules/clients/clients.service.ts :: requirePermission` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.service.ts :: listClients` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.service.ts :: getClient` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.service.ts :: createClient` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.service.ts :: updateClient` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.service.ts :: createClientContact` → Final Module 4 Client Management
- KEEP `apps/api/src/modules/clients/clients.service.ts :: updateClientContact` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/api/clients-api.ts :: listClients` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/api/clients-api.ts :: getClient` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/api/clients-api.ts :: createClient` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/api/clients-api.ts :: updateClient` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/api/clients-api.ts :: createClientContact` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/api/clients-api.ts :: updateClientContact` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/components/client-details-panel.tsx :: ClientDetailsPanel` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/components/client-details-panel.tsx :: ClientDetailsContent` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/components/client-details-panel.tsx :: handleUpdate` → Review in owning final module
- KEEP `apps/web/src/features/clients/components/client-details-panel.tsx :: handleContact` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/components/client-details-panel.tsx :: handleArchive` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/components/client-details-panel.tsx :: handleReactivate` → Review in owning final module
- KEEP `apps/web/src/features/clients/components/client-details-panel.tsx :: ContactEditForm` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/hooks/clients.ts :: useClients` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/hooks/clients.ts :: useClient` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/hooks/clients.ts :: useCreateClient` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/hooks/clients.ts :: useUpdateClient` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/hooks/clients.ts :: useCreateClientContact` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/hooks/clients.ts :: useUpdateClientContact` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/hooks/clients.ts :: onSuccess` → Review in owning final module
- KEEP `apps/web/src/features/clients/pages/clients-page.tsx :: ClientsPage` → Final Module 4 Client Management
- KEEP `apps/web/src/features/clients/pages/clients-page.tsx :: handleSearch` → Review in owning final module
- KEEP `apps/web/src/features/clients/pages/clients-page.tsx :: handleCreate` → Review in owning final module

### procurement

Decision: **MIXED**. Keep only final-scope behavior; move reusable logic to its final owner and delete obsolete workflow logic in later passes.

**Files requiring split/refactor review**
- REVIEW `apps/api/src/modules/procurement/index.ts`
- REVIEW `apps/api/src/modules/procurement/procurement.repository.ts`
- REVIEW `apps/api/src/modules/procurement/procurement.routes.ts`
- REVIEW `apps/api/src/modules/procurement/procurement.schema.ts`
- REVIEW `apps/api/src/modules/procurement/procurement.service.ts`
- REVIEW `apps/web/src/features/procurement/api/procurement-api.ts`
- REVIEW `apps/web/src/features/procurement/components/procurement-workspace.tsx`
- REVIEW `apps/web/src/features/procurement/hooks/procurement.ts`
- REVIEW `apps/web/src/features/procurement/pages/procurement-page.tsx`

**Current routes to reconcile**
- REVIEW `GET /api/v1/procurement/requisitions`
- REVIEW `POST /api/v1/procurement/requisitions`
- REVIEW `POST /api/v1/procurement/requisitions/:id/approve`
- REVIEW `GET /api/v1/procurement/purchase-orders`
- REVIEW `POST /api/v1/procurement/purchase-orders`
- REVIEW `GET /api/v1/procurement/purchase-orders/:id`
- REVIEW `POST /api/v1/procurement/purchase-orders/:id/issue`
- REVIEW `POST /api/v1/procurement/purchase-orders/:id/cancel`
- REVIEW `POST /api/v1/procurement/goods-receipts`
- REVIEW `GET /api/v1/procurement/goods-receipts/:id`

**Named function/component decisions**
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: assertPageWindow` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: projectVisibilityWhere` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: constructor` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: findProjectById` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: findActiveMaterialIds` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: findProjectStageIds` → Final Module 10 Procurement / Purchase after refactor
- MOVE `apps/api/src/modules/procurement/procurement.repository.ts :: findVendorById` → Final Module 5 Supplier & Subcontractor Management
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: findPurchaseRequisitionById` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: lockPurchaseRequisitionForWrite` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: updatePurchaseRequisitionStatus` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: findPurchaseOrderById` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: lockPurchaseOrderForWrite` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: listOrderedQuantities` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: cancelPurchaseOrderCommitments` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.repository.ts :: findGoodsReceiptById` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.routes.ts :: readIdempotencyKey` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.routes.ts :: registerProcurementRoutes` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.schema.ts :: createProcurementError` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: hasStatus` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: decimalToScale4` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: minorUnitsToMoney` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: divideRoundHalfUp` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: storedDecimal` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: dateOnly` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: requisitionResponse` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: purchaseOrderResponse` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: goodsReceiptResponse` → Review in owning final module
- MOVE `apps/api/src/modules/procurement/procurement.service.ts :: isPurchasableVendor` → Final Module 5 Supplier & Subcontractor Management
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: preparePurchaseOrderLines` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: constructor` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: requireProjectPermission` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: resolveProjectVisibility` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: requireWritableProject` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: requireProjectStages` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: listPurchaseRequisitions` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: createPurchaseRequisition` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: approvePurchaseRequisition` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: listPurchaseOrders` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: getPurchaseOrder` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: createPurchaseOrder` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: issuePurchaseOrder` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: cancelPurchaseOrder` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: createGoodsReceipt` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: getGoodsReceipt` → Review in owning final module
- KEEP `apps/api/src/modules/procurement/procurement.service.ts :: next` → Review in owning final module
- KEEP `apps/web/src/features/procurement/api/procurement-api.ts :: writeHeaders` → Review in owning final module
- KEEP `apps/web/src/features/procurement/api/procurement-api.ts :: pageQuery` → Review in owning final module
- MOVE `apps/web/src/features/procurement/api/procurement-api.ts :: listVendors` → Final Module 5 Supplier & Subcontractor Management
- KEEP `apps/web/src/features/procurement/api/procurement-api.ts :: listRequisitions` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/web/src/features/procurement/api/procurement-api.ts :: createRequisition` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/web/src/features/procurement/api/procurement-api.ts :: approveRequisition` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/web/src/features/procurement/api/procurement-api.ts :: listPurchaseOrders` → Review in owning final module
- KEEP `apps/web/src/features/procurement/api/procurement-api.ts :: createPurchaseOrder` → Review in owning final module
- KEEP `apps/web/src/features/procurement/api/procurement-api.ts :: issuePurchaseOrder` → Review in owning final module
- KEEP `apps/web/src/features/procurement/api/procurement-api.ts :: cancelPurchaseOrder` → Review in owning final module
- KEEP `apps/web/src/features/procurement/api/procurement-api.ts :: createGoodsReceipt` → Review in owning final module
- KEEP `apps/web/src/features/procurement/components/procurement-workspace.tsx :: decimalToScale4` → Review in owning final module
- KEEP `apps/web/src/features/procurement/components/procurement-workspace.tsx :: scale4ToDecimal` → Review in owning final module
- KEEP `apps/web/src/features/procurement/components/procurement-workspace.tsx :: openQuantity` → Review in owning final module
- KEEP `apps/web/src/features/procurement/components/procurement-workspace.tsx :: mutationMessage` → Review in owning final module
- KEEP `apps/web/src/features/procurement/components/procurement-workspace.tsx :: ProcurementWorkspace` → Review in owning final module
- KEEP `apps/web/src/features/procurement/components/procurement-workspace.tsx :: handleCreateRequisition` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/web/src/features/procurement/components/procurement-workspace.tsx :: handleCreatePurchaseOrder` → Review in owning final module
- KEEP `apps/web/src/features/procurement/components/procurement-workspace.tsx :: handleCreateGoodsReceipt` → Review in owning final module
- KEEP `apps/web/src/features/procurement/components/procurement-workspace.tsx :: PurchaseOrderRow` → Review in owning final module
- KEEP `apps/web/src/features/procurement/components/procurement-workspace.tsx :: fraction` → Final Module 10 Procurement / Purchase after refactor
- MOVE `apps/web/src/features/procurement/hooks/procurement.ts :: useProcurementVendors` → Final Module 5 Supplier & Subcontractor Management
- KEEP `apps/web/src/features/procurement/hooks/procurement.ts :: useRequisitions` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/web/src/features/procurement/hooks/procurement.ts :: useProcurementPurchaseOrders` → Review in owning final module
- KEEP `apps/web/src/features/procurement/hooks/procurement.ts :: refreshProcurement` → Review in owning final module
- KEEP `apps/web/src/features/procurement/hooks/procurement.ts :: useCreateRequisition` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/web/src/features/procurement/hooks/procurement.ts :: useApproveRequisition` → Final Module 10 Procurement / Purchase after refactor
- KEEP `apps/web/src/features/procurement/hooks/procurement.ts :: useCreateProcurementPurchaseOrder` → Review in owning final module
- KEEP `apps/web/src/features/procurement/hooks/procurement.ts :: useIssueProcurementPurchaseOrder` → Review in owning final module
- KEEP `apps/web/src/features/procurement/hooks/procurement.ts :: useCancelProcurementPurchaseOrder` → Review in owning final module
- KEEP `apps/web/src/features/procurement/hooks/procurement.ts :: useCreateGoodsReceipt` → Review in owning final module
- KEEP `apps/web/src/features/procurement/pages/procurement-page.tsx :: ProcurementPage` → Review in owning final module

### purchase-orders

Decision: **MIXED**. Keep only final-scope behavior; move reusable logic to its final owner and delete obsolete workflow logic in later passes.

**Files requiring split/refactor review**

**Current routes to reconcile**
- None found

**Named function/component decisions**
- None found

### subcontracts

Decision: **MIXED**. Keep only final-scope behavior; move reusable logic to its final owner and delete obsolete workflow logic in later passes.

**Files requiring split/refactor review**

**Current routes to reconcile**
- None found

**Named function/component decisions**
- None found

### projects

Decision: **ALIGNED FOR FINAL MODULE 6 AFTER PASS B6**. Project Management now owns only Project master/commercial/lifecycle behavior. Project team/member mutation has been removed from the active Project API, service, repository and React feature.

**Active Final Module 6 files**
- KEEP `apps/api/src/modules/projects/index.ts`
- KEEP `apps/api/src/modules/projects/projects.repository.ts`
- KEEP `apps/api/src/modules/projects/projects.routes.ts`
- KEEP `apps/api/src/modules/projects/projects.schema.ts`
- KEEP `apps/api/src/modules/projects/projects.service.ts`
- KEEP `apps/web/src/features/projects/api/projects-api.ts`
- KEEP `apps/web/src/features/projects/components/project-details-panel.tsx`
- KEEP `apps/web/src/features/projects/hooks/projects.ts`
- KEEP `apps/web/src/features/projects/pages/projects-page.tsx`

**Active routes**
- KEEP `GET /api/v1/projects`
- KEEP `POST /api/v1/projects`
- KEEP `GET /api/v1/projects/:id`
- KEEP `PATCH /api/v1/projects/:id`
- KEEP `POST /api/v1/projects/:id/activate`
- KEEP `POST /api/v1/projects/:id/suspend`
- KEEP `POST /api/v1/projects/:id/complete`
- KEEP `POST /api/v1/projects/:id/close`
- REMOVED `PUT /api/v1/projects/:id/members` → employee Project/stage assignments belong to Final Module 8.

**Pass B6 ownership cleanup**
- REMOVED `projects.manage_members` from the active Project permission contract and mark it as a removed legacy permission in Administration.
- REMOVED Project member request/response schemas, repository functions, service transaction/audit/outbox logic, route serializers and React member editor.
- Project detail now returns only Project master + lifecycle history.
- ADDED distinct `projects.complete` authority; suspend uses `projects.update`, complete uses `projects.complete`, and close uses `projects.close`.
- B8 MIGRATED useful `project_members` rows that resolve to a same-company Employee into `project_team_assignments`, then removed the legacy table/model through a forward migration.
- REMOVED obsolete Module-24B runtime verification scripts/tests/package commands because that superseded membership API no longer exists. Historical migrations remain untouched.

### budgets-job-cost

Decision: **MIXED**. Keep only final-scope behavior; move reusable logic to its final owner and delete obsolete workflow logic in later passes.

**Files requiring split/refactor review**
- REVIEW `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts`
- REVIEW `apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts`
- REVIEW `apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts`
- REVIEW `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts`
- REVIEW `apps/api/src/modules/budgets-job-cost/index.ts`
- REVIEW `apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts`
- REVIEW `apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx`
- REVIEW `apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts`
- REVIEW `apps/web/src/features/budgets-job-cost/pages/budgets-job-cost-page.tsx`

**Current routes to reconcile**
- REVIEW `GET /api/v1/projects/:projectId/budgets/current`
- REVIEW `POST /api/v1/projects/:projectId/budgets`
- REVIEW `PUT /api/v1/projects/:projectId/budgets/:id/lines`
- REVIEW `POST /api/v1/projects/:projectId/budgets/:id/freeze`
- REVIEW `GET /api/v1/projects/:projectId/job-cost`
- REVIEW `GET /api/v1/projects/:projectId/job-cost/ledger`
- REVIEW `PUT /api/v1/projects/:projectId/forecast`

**Named function/component decisions**
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: assertPageWindow` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: decimalString` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: constructor` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: lockProjectForBudgetWrite` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: findLatestProjectBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: findLatestProjectBudgetByStatus` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: findProjectBudgetById` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: lockProjectBudgetForWrite` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: createProjectBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: replaceBudgetLines` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: sumBudgetLines` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: updateProjectBudgetTotal` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: findProjectStagesByIds` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: listForecastLines` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: replaceForecastLines` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: sumForecastLines` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: sumCostCommitments` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: sumCostActuals` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts :: listJobCostLedger` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts :: errorResponseSchema` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts :: readIdempotencyKey` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts :: serializeBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts :: serializeJobCost` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts :: serializeForecast` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts :: serializeLedger` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts :: registerBudgetsJobCostRoutes` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts :: createModule9Error` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: hasStatus` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: uniqueIds` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: forecastKey` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: hasDuplicates` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: moneyToMinorUnits` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: minorUnitsToMoney` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: requireMoneyRange` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: storedMoneyToMinorUnits` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: storedMoney` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: dateOnly` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: budgetResponse` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: forecastResponse` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: budgetAuditSnapshot` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: constructor` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: requireWritableProject` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: getCurrentBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: createBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: replaceBudgetLines` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: freezeBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: getJobCost` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: updateForecast` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts :: getJobCostLedger` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts :: commandHeaders` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts :: getCurrentBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts :: createBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts :: replaceBudgetLines` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts :: freezeBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts :: getJobCost` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts :: updateForecast` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts :: getJobCostLedger` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx :: budgetLineDefaults` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx :: errorMessage` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx :: BudgetJobCostWorkspace` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx :: addBudgetLine` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx :: addForecastLine` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx :: handleSaveBudgetLines` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx :: handleUpdateForecast` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts :: useCurrentBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts :: useJobCost` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts :: useJobCostLedger` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts :: useCreateBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts :: useReplaceBudgetLines` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts :: useFreezeBudget` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts :: useUpdateForecast` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts :: onSuccess` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/pages/budgets-job-cost-page.tsx :: BudgetsJobCostPage` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/pages/budgets-job-cost-page.tsx :: handleSelectProject` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/pages/budgets-job-cost-page.tsx :: handlePreviousProjectPage` → Final Module 9 Project Budget & Cost Tracking, with schema refactor
- KEEP `apps/web/src/features/budgets-job-cost/pages/budgets-job-cost-page.tsx :: handleNextProjectPage` → Final Module 9 Project Budget & Cost Tracking, with schema refactor

### hr-payroll

Decision: **MIXED**. Keep only final-scope behavior; move reusable logic to its final owner and delete obsolete workflow logic in later passes.

**Files requiring split/refactor review**

**Current routes to reconcile**
- None found

**Named function/component decisions**
- None found

### workforce-timesheets

Decision: **MIXED**. Keep only final-scope behavior; move reusable logic to its final owner and delete obsolete workflow logic in later passes.

**Files requiring split/refactor review**

**Current routes to reconcile**
- None found

**Named function/component decisions**
- None found

### client-billing

Decision: **MIXED**. Keep only final-scope behavior; move reusable logic to its final owner and delete obsolete workflow logic in later passes.

**Files requiring split/refactor review**
- REVIEW `apps/api/src/modules/client-billing/client-billing.repository.ts`
- REVIEW `apps/api/src/modules/client-billing/client-billing.routes.ts`
- REVIEW `apps/api/src/modules/client-billing/client-billing.schema.ts`
- REVIEW `apps/api/src/modules/client-billing/client-billing.service.ts`
- REVIEW `apps/api/src/modules/client-billing/index.ts`
- REVIEW `apps/web/src/features/client-billing/api/client-billing-api.ts`
- REVIEW `apps/web/src/features/client-billing/components/client-billing-workspace.tsx`
- REVIEW `apps/web/src/features/client-billing/hooks/client-billing.ts`
- REVIEW `apps/web/src/features/client-billing/pages/client-billing-page.tsx`

**Current routes to reconcile**
- REVIEW `GET /api/v1/client-billing/projects/:projectId/settings`
- REVIEW `PUT /api/v1/client-billing/projects/:projectId/settings`
- REVIEW `GET /api/v1/client-billing/claims`
- REVIEW `POST /api/v1/client-billing/claims`
- REVIEW `PATCH /api/v1/client-billing/claims/:id`
- REVIEW `POST /api/v1/client-billing/claims/:id/finalize`
- REVIEW `POST /api/v1/client-billing/claims/:id/invoice`
- REVIEW `GET /api/v1/client-billing/invoices`
- REVIEW `GET /api/v1/client-billing/invoices/:id`

**Named function/component decisions**
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: assertPage` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: uniqueIds` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: projectWhere` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: projectIsVisible` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: claimInclude` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: constructor` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: findProject` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: findProjectStagesByIds` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: sumProjectCostActuals` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: sumStageCostActuals` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: sumFinalizedClaimGross` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: sumFinalizedClaimLinesByStage` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: findGlAccountById` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: findGlAccountByCode` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: findSettings` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: findClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: lockClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: findInvoiceByClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.repository.ts :: findInvoice` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.routes.ts :: dataEnvelope` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.routes.ts :: readIdempotencyKey` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.routes.ts :: registerClientBillingRoutes` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.routes.ts :: authenticate` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.schema.ts :: createClientBillingError` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: inputDate` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: dateOnly` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: moneyToMinorUnits` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: minorUnitsToMoney` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: percentageOf` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: claimStageIds` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: clientInvoiceFinanceSourceKey` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: allocateCertifiedInvoiceLines` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: claimedMinorUnitsByStage` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: requireBillingMethod` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: pageWindow` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: requireWritableProject` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: requireInvoiceDateOrder` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: settingsResponse` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: claimLineResponse` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: invoiceResponse` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: claimResponse` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: constructor` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: hasCompanyPermission` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: resolveVisibility` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: requireProjectPermission` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: getSettings` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: updateSettings` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: updateSettingsOnce` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: listClaims` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: createClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: createClaimOnce` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: updateClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: updateClaimOnce` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: finalizeClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: finalizeClaimOnce` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: requireInvoicePostingAccounts` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: createInvoice` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: createInvoiceOnce` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: listInvoices` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: getInvoice` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: scaledPercent` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/api/src/modules/client-billing/client-billing.service.ts :: lineTotal` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: listQuery` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: commandHeaders` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: getBillingSettings` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: updateBillingSettings` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: listBillingClaims` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: createBillingClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: updateBillingClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: finalizeBillingClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: createClientInvoice` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: listClientInvoices` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/api/client-billing-api.ts :: getClientInvoice` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/components/client-billing-workspace.tsx :: claimLines` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/components/client-billing-workspace.tsx :: displayMoney` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/components/client-billing-workspace.tsx :: billingMethodLabel` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/components/client-billing-workspace.tsx :: billingBasisText` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/components/client-billing-workspace.tsx :: ClientBillingWorkspace` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/components/client-billing-workspace.tsx :: stageLabel` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/web/src/features/client-billing/components/client-billing-workspace.tsx :: submitSettings` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/web/src/features/client-billing/components/client-billing-workspace.tsx :: submitClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/components/client-billing-workspace.tsx :: startEditingClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/components/client-billing-workspace.tsx :: submitInvoice` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: newIdempotencyKey` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: invalidateClientBilling` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: invalidateInvoiceEffects` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: useBillingSettings` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: useUpdateBillingSettings` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: useBillingClaims` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: useCreateBillingClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: useUpdateBillingClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: useFinalizeBillingClaim` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: useCreateClientInvoice` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: useClientInvoices` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines
- MOVE `apps/web/src/features/client-billing/hooks/client-billing.ts :: onSuccess` → Final Module 15 Client Billing after contract/BOQ decoupling
- MOVE `apps/web/src/features/client-billing/pages/client-billing-page.tsx :: ClientBillingPage` → Final Module 15 Client Billing, rewritten around project billing settings and stage lines

## C. Prisma legacy model inventory

The following legacy-owned models currently exist and are marked **DELETE through a future forward migration**, not in Pass A1:



### Non-legacy models that still reference legacy models/fields



## D. Cross-cutting source/test dependency map

These files mention each legacy concept and must be reviewed before deleting the owning module. Historical migration files are intentionally not listed for deletion.

### Approvals
- REVIEW `packages/database/prisma/migration-gates.json`
- REVIEW `scripts/acceptance/verify-pass-172-service-readability.mjs`
- REVIEW `scripts/final-21/build-legacy-cleanup-manifest.mjs`
- REVIEW `scripts/module-11/verify-stage-16-http.mjs`
- REVIEW `scripts/module-11/verify-stage-16-service.mjs`
- REVIEW `scripts/module-17/verify-stage-22-http.mjs`
- REVIEW `scripts/module-17/verify-stage-22-operations.mjs`
- REVIEW `scripts/module-17/verify-stage-22-repository.mjs`
- REVIEW `scripts/module-17/verify-stage-22-service.mjs`
- REVIEW `scripts/module-22/verify-stage-3.mjs`
- REVIEW `scripts/module-9/verify-stage-14-http.mjs`
- REVIEW `scripts/verify-pass-306-payroll-run-lifecycle.mjs`
- REVIEW `tests/api-logging-plugin.test.mjs`
- REVIEW `tests/audit-repair-regression.test.mjs`
- REVIEW `tests/config.test.mjs`
- REVIEW `tests/database.test.mjs`
- REVIEW `tests/e2e/module-11-browser.spec.mjs`
- REVIEW `tests/e2e/module-17-browser.spec.mjs`
- REVIEW `tests/e2e/module-22-browser.spec.mjs`
- REVIEW `tests/e2e/module-3-browser.spec.mjs`
- REVIEW `tests/e2e/module-9-browser.spec.mjs`
- REVIEW `tests/final-21-database-cleanup.test.mjs`
- REVIEW `tests/final-21-equipment-b13.test.mjs`
- REVIEW `tests/final-21-scope.test.mjs`
- REVIEW `tests/final-21-site-expenses-b15-10-final-acceptance.test.mjs`
- REVIEW `tests/final-21-supplier-payables-b16-10-final-acceptance.test.mjs`
- REVIEW `tests/integration/module-11-api.integration.test.mjs`
- REVIEW `tests/integration/module-17-api.integration.test.mjs`
- REVIEW `tests/integration/module-22-api.integration.test.mjs`
- REVIEW `tests/integration/module-3-api.integration.test.mjs`
- REVIEW `tests/integration/module-7-api.integration.test.mjs`
- REVIEW `tests/integration/module-8-api.integration.test.mjs`
- REVIEW `tests/integration/module-9-api.integration.test.mjs`
- REVIEW `tests/module-10-static.test.mjs`
- REVIEW `tests/module-11-static.test.mjs`
- REVIEW `tests/module-17-static.test.mjs`
- REVIEW `tests/module-22-static.test.mjs`
- REVIEW `tests/module-3-static.test.mjs`
- REVIEW `tests/module-7-static.test.mjs`
- REVIEW `tests/module-8-static.test.mjs`
- REVIEW `tests/module-9-static.test.mjs`
- REVIEW `tests/pass-175-final-repair-audit.test.mjs`
- REVIEW `tests/pass-306-payroll-run-lifecycle.test.mjs`
- REVIEW `tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs`
- REVIEW `tests/pass-361-module-7-budget-approval-draft-readback.test.mjs`
- REVIEW `tests/pass-369-module-10-uom-count-stock-period.test.mjs`
- REVIEW `tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs`
- REVIEW `tests/pass-410-procurement-runtime-config-wiring-repair.test.mjs`
- REVIEW `tests/pass-411-module-22-delegation-readback-contract-freeze.test.mjs`
- REVIEW `tests/pass-412-module-22-delegation-readback-implementation.test.mjs`

### Tender / Estimate
- REVIEW `apps/api/src/modules/procurement/procurement.repository.ts`
- REVIEW `apps/web/src/features/projects/components/project-details-panel.tsx`
- REVIEW `apps/web/src/features/projects/pages/projects-page.tsx`
- REVIEW `packages/database/prisma/migration-checksums.json`
- REVIEW `packages/database/prisma/migration-gates.json`
- REVIEW `packages/database/prisma/schema.prisma`
- REVIEW `scripts/acceptance/verify-pass-171-ui-completion.mjs`
- REVIEW `scripts/acceptance/verify-pass-172-service-readability.mjs`
- REVIEW `scripts/acceptance/verify-pass-173-consolidated-regression.mjs`
- REVIEW `scripts/acceptance/verify-pass-175-final-handoff.mjs`
- REVIEW `scripts/final-21/build-legacy-cleanup-manifest.mjs`
- REVIEW `scripts/module-17/verify-stage-22-contract.mjs`
- REVIEW `scripts/module-17/verify-stage-22-integration-security.mjs`
- REVIEW `scripts/module-17/verify-stage-22-persistence.mjs`
- REVIEW `scripts/module-17/verify-stage-22-playwright.mjs`
- REVIEW `scripts/module-17/verify-stage-22-react-workspace.mjs`
- REVIEW `scripts/module-17/verify-stage-22-schema.mjs`
- REVIEW `scripts/module-17/verify-stage-22.mjs`
- REVIEW `scripts/module-2/verify-stage-4.mjs`
- REVIEW `scripts/module-3/verify-stage-5.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-contract.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-integration.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-operations.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-playwright.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-react-register.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-security.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-contract.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-http.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-integration-security.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-persistence.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-playwright.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-react.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-repository.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-schema.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-service.mjs`
- REVIEW `scripts/module-4b/verify-stage-10.mjs`
- REVIEW `scripts/module-5/verify-stage-7-integration.mjs`
- REVIEW `scripts/module-5/verify-stage-7-operations.mjs`
- REVIEW `scripts/module-5/verify-stage-7-playwright.mjs`
- REVIEW `scripts/module-5/verify-stage-7-react-register.mjs`
- REVIEW `scripts/module-5/verify-stage-7-react-workflow.mjs`
- REVIEW `scripts/module-5/verify-stage-7-security.mjs`
- REVIEW `scripts/module-5/verify-stage-7-service.mjs`
- REVIEW `scripts/module-7/verify-stage-12-contract.mjs`
- REVIEW `scripts/module-7/verify-stage-12-schema.mjs`
- REVIEW `scripts/module-7/verify-stage-12-service.mjs`
- REVIEW `scripts/module-8/verify-stage-13-schema.mjs`
- REVIEW `tests/audit-repair-regression.test.mjs`
- REVIEW `tests/config.test.mjs`
- REVIEW `tests/database.test.mjs`
- REVIEW `tests/e2e/module-16-browser.spec.mjs`
- REVIEW `tests/e2e/module-17-browser.spec.mjs`
- REVIEW `tests/e2e/module-2-browser.spec.mjs`
- REVIEW `tests/e2e/module-3-browser.spec.mjs`
- REVIEW `tests/e2e/module-4a-browser.spec.mjs`
- REVIEW `tests/e2e/module-4b-browser.spec.mjs`
- REVIEW `tests/e2e/module-5-browser.spec.mjs`
- REVIEW `tests/e2e/module-6-browser.spec.mjs`
- REVIEW `tests/e2e/module-7-browser.spec.mjs`
- REVIEW `tests/e2e/module-8-browser.spec.mjs`
- REVIEW `tests/e2e/module-9-browser.spec.mjs`
- REVIEW `tests/final-21-budget-cost-b10.test.mjs`
- REVIEW `tests/final-21-database-cleanup.test.mjs`
- REVIEW `tests/final-21-project-management.test.mjs`
- REVIEW `tests/final-21-scope.test.mjs`
- REVIEW `tests/integration/module-16-api.integration.test.mjs`
- REVIEW `tests/integration/module-17-api.integration.test.mjs`
- REVIEW `tests/integration/module-2-api.integration.test.mjs`
- REVIEW `tests/integration/module-3-api.integration.test.mjs`
- REVIEW `tests/integration/module-4a-api.integration.test.mjs`
- REVIEW `tests/integration/module-4b-api.integration.test.mjs`
- REVIEW `tests/integration/module-5-api.integration.test.mjs`
- REVIEW `tests/integration/module-7-api.integration.test.mjs`
- REVIEW `tests/integration/module-8-api.integration.test.mjs`
- REVIEW `tests/module-11-static.test.mjs`
- REVIEW `tests/module-17-static.test.mjs`
- REVIEW `tests/module-2-static.test.mjs`
- REVIEW `tests/module-3-static.test.mjs`
- REVIEW `tests/module-4a-static.test.mjs`
- REVIEW `tests/module-4b-static.test.mjs`
- REVIEW `tests/module-5-static.test.mjs`
- REVIEW `tests/module-7-static.test.mjs`
- REVIEW `tests/module-8-static.test.mjs`
- REVIEW `tests/pass-175-final-repair-audit.test.mjs`
- REVIEW `tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs`
- REVIEW `tests/pass-366-module-5-controlled-suspend-resume.test.mjs`
- REVIEW `tests/pass-367-module-4-boq-durable-revision-readback.test.mjs`
- REVIEW `tests/pass-378-stage-0-23-code-quality-audit.test.mjs`
- REVIEW `tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs`
- REVIEW `tests/pass-412-module-22-delegation-readback-implementation.test.mjs`

### BOQ
- REVIEW `apps/web/src/features/projects/components/project-details-panel.tsx`
- REVIEW `apps/web/src/features/projects/pages/projects-page.tsx`
- REVIEW `packages/database/prisma/migration-checksums.json`
- REVIEW `packages/database/prisma/migration-gates.json`
- REVIEW `scripts/acceptance/verify-pass-171-ui-completion.mjs`
- REVIEW `scripts/acceptance/verify-pass-173-consolidated-regression.mjs`
- REVIEW `scripts/acceptance/verify-pass-175-final-handoff.mjs`
- REVIEW `scripts/acceptance/verify-pass-366-module-5-controlled-suspend-resume.mjs`
- REVIEW `scripts/acceptance/verify-pass-367-module-4-boq-durable-revision-readback.mjs`
- REVIEW `scripts/final-21/build-legacy-cleanup-manifest.mjs`
- REVIEW `scripts/module-11/verify-stage-16-contract.mjs`
- REVIEW `scripts/module-11/verify-stage-16-persistence.mjs`
- REVIEW `scripts/module-11/verify-stage-16-react.mjs`
- REVIEW `scripts/module-11/verify-stage-16-repository.mjs`
- REVIEW `scripts/module-11/verify-stage-16-schema.mjs`
- REVIEW `scripts/module-11/verify-stage-16.mjs`
- REVIEW `scripts/module-16/verify-stage-23-contract.mjs`
- REVIEW `scripts/module-16/verify-stage-23-integration-security.mjs`
- REVIEW `scripts/module-16/verify-stage-23-operations.mjs`
- REVIEW `scripts/module-16/verify-stage-23-persistence.mjs`
- REVIEW `scripts/module-16/verify-stage-23-playwright.mjs`
- REVIEW `scripts/module-16/verify-stage-23-react-workspace.mjs`
- REVIEW `scripts/module-16/verify-stage-23-repository.mjs`
- REVIEW `scripts/module-16/verify-stage-23-schema.mjs`
- REVIEW `scripts/module-16/verify-stage-23-service.mjs`
- REVIEW `scripts/module-16/verify-stage-23.mjs`
- REVIEW `scripts/module-17/verify-stage-22-contract.mjs`
- REVIEW `scripts/module-17/verify-stage-22-persistence.mjs`
- REVIEW `scripts/module-17/verify-stage-22-react-workspace.mjs`
- REVIEW `scripts/module-17/verify-stage-22-repository.mjs`
- REVIEW `scripts/module-17/verify-stage-22-schema.mjs`
- REVIEW `scripts/module-17/verify-stage-22.mjs`
- REVIEW `scripts/module-3/verify-stage-5.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-api-contract.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-contract.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-http.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-integration.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-operations.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-persistence.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-playwright.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-react-register.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-react-workflow.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-repository.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-schema.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-security.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-service.mjs`
- REVIEW `scripts/module-4a/verify-stage-6.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-contract.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-http.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-integration-security.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-operations.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-persistence.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-playwright.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-react.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-repository.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-schema.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-service.mjs`
- REVIEW `scripts/module-4b/verify-stage-10.mjs`
- REVIEW `scripts/module-6/verify-stage-9-repository.mjs`
- REVIEW `scripts/module-6/verify-stage-9.mjs`
- REVIEW `scripts/module-7/verify-stage-12-contract.mjs`
- REVIEW `tests/audit-repair-regression.test.mjs`
- REVIEW `tests/database.test.mjs`
- REVIEW `tests/e2e/module-16-browser.spec.mjs`
- REVIEW `tests/e2e/module-4a-browser.spec.mjs`
- REVIEW `tests/e2e/module-4b-browser.spec.mjs`
- REVIEW `tests/final-21-database-cleanup.test.mjs`
- REVIEW `tests/final-21-repair-r3-excluded-scope.test.mjs`
- REVIEW `tests/final-21-repair-r5-production-cleanup.test.mjs`
- REVIEW `tests/final-21-scope.test.mjs`
- REVIEW `tests/final-21-simple-cost-categories.test.mjs`
- REVIEW `tests/integration/module-11-api.integration.test.mjs`
- REVIEW `tests/integration/module-16-api.integration.test.mjs`
- REVIEW `tests/integration/module-17-api.integration.test.mjs`
- REVIEW `tests/integration/module-4a-api.integration.test.mjs`
- REVIEW `tests/integration/module-4b-api.integration.test.mjs`
- REVIEW `tests/module-11-static.test.mjs`
- REVIEW `tests/module-16-static.test.mjs`
- REVIEW `tests/module-17-static.test.mjs`
- REVIEW `tests/module-3-static.test.mjs`
- REVIEW `tests/module-4a-static.test.mjs`
- REVIEW `tests/module-4b-static.test.mjs`
- REVIEW `tests/module-5-static.test.mjs`
- REVIEW `tests/module-6-static.test.mjs`
- REVIEW `tests/module-7-static.test.mjs`
- REVIEW `tests/pass-175-final-repair-audit.test.mjs`
- REVIEW `tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs`
- REVIEW `tests/pass-367-module-4-boq-durable-revision-readback.test.mjs`
- REVIEW `tests/pass-378-stage-0-23-code-quality-audit.test.mjs`
- REVIEW `tests/pass-379-stage-0-23-final-repair-acceptance.test.mjs`
- REVIEW `tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs`

### WBS / Cost Code
- REVIEW `apps/web/src/features/projects/components/project-details-panel.tsx`
- REVIEW `apps/web/src/features/projects/pages/projects-page.tsx`
- REVIEW `packages/database/prisma/migration-checksums.json`
- REVIEW `packages/database/prisma/migration-gates.json`
- REVIEW `scripts/acceptance/verify-pass-175-final-handoff.mjs`
- REVIEW `scripts/acceptance/verify-pass-358-stage-0-23-repair-contract-freeze.mjs`
- REVIEW `scripts/acceptance/verify-pass-359-module-6-durable-wbs-freeze-reopen.mjs`
- REVIEW `scripts/acceptance/verify-pass-360-module-6-cost-type-archive-lifecycle.mjs`
- REVIEW `scripts/acceptance/verify-pass-366-module-5-controlled-suspend-resume.mjs`
- REVIEW `scripts/final-21/build-legacy-cleanup-manifest.mjs`
- REVIEW `scripts/module-10/verify-stage-15-contract.mjs`
- REVIEW `scripts/module-10/verify-stage-15-persistence.mjs`
- REVIEW `scripts/module-10/verify-stage-15-playwright.mjs`
- REVIEW `scripts/module-10/verify-stage-15-react.mjs`
- REVIEW `scripts/module-10/verify-stage-15-schema.mjs`
- REVIEW `scripts/module-10/verify-stage-15.mjs`
- REVIEW `scripts/module-11/verify-stage-16-contract.mjs`
- REVIEW `scripts/module-11/verify-stage-16-schema.mjs`
- REVIEW `scripts/module-11/verify-stage-16.mjs`
- REVIEW `scripts/module-17/verify-stage-22-contract.mjs`
- REVIEW `scripts/module-17/verify-stage-22-playwright.mjs`
- REVIEW `scripts/module-17/verify-stage-22-react-workspace.mjs`
- REVIEW `scripts/module-17/verify-stage-22-repository.mjs`
- REVIEW `scripts/module-17/verify-stage-22-schema.mjs`
- REVIEW `scripts/module-17/verify-stage-22.mjs`
- REVIEW `scripts/module-21/verify-stage-21-contract.mjs`
- REVIEW `scripts/module-21/verify-stage-21-integration-security.mjs`
- REVIEW `scripts/module-21/verify-stage-21-persistence.mjs`
- REVIEW `scripts/module-21/verify-stage-21-playwright.mjs`
- REVIEW `scripts/module-21/verify-stage-21-react.mjs`
- REVIEW `scripts/module-21/verify-stage-21-repository.mjs`
- REVIEW `scripts/module-21/verify-stage-21-schema.mjs`
- REVIEW `scripts/module-21/verify-stage-21-service.mjs`
- REVIEW `scripts/module-21/verify-stage-21.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-api-contract.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-contract.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-http.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-integration.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-operations.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-persistence.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-playwright.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-react-register.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-react-workflow.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-repository.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-schema.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-security.mjs`
- REVIEW `scripts/module-4a/verify-stage-6-service.mjs`
- REVIEW `scripts/module-4a/verify-stage-6.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-contract.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-http.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-integration-security.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-operations.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-persistence.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-playwright.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-react.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-repository.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-schema.mjs`
- REVIEW `scripts/module-4b/verify-stage-10-service.mjs`
- REVIEW `scripts/module-4b/verify-stage-10.mjs`
- REVIEW `scripts/module-6/verify-stage-9-api-contract.mjs`
- REVIEW `scripts/module-6/verify-stage-9-contract.mjs`
- REVIEW `scripts/module-6/verify-stage-9-http.mjs`
- REVIEW `scripts/module-6/verify-stage-9-integration.mjs`
- REVIEW `scripts/module-6/verify-stage-9-operations.mjs`
- REVIEW `scripts/module-6/verify-stage-9-persistence.mjs`
- REVIEW `scripts/module-6/verify-stage-9-playwright.mjs`
- REVIEW `scripts/module-6/verify-stage-9-react-register.mjs`
- REVIEW `scripts/module-6/verify-stage-9-react-workflow.mjs`
- REVIEW `scripts/module-6/verify-stage-9-repository.mjs`
- REVIEW `scripts/module-6/verify-stage-9-schema.mjs`
- REVIEW `scripts/module-6/verify-stage-9-security.mjs`
- REVIEW `scripts/module-6/verify-stage-9-service.mjs`
- REVIEW `scripts/module-6/verify-stage-9.mjs`
- REVIEW `scripts/module-7/verify-stage-12-persistence.mjs`
- REVIEW `scripts/module-7/verify-stage-12-playwright.mjs`
- REVIEW `scripts/module-7/verify-stage-12-react.mjs`
- REVIEW `scripts/module-7/verify-stage-12-schema.mjs`
- REVIEW `scripts/module-8/verify-stage-13-contract.mjs`
- REVIEW `scripts/module-8/verify-stage-13-playwright.mjs`
- REVIEW `scripts/module-8/verify-stage-13-schema.mjs`
- REVIEW `scripts/module-9/verify-stage-14-schema.mjs`
- REVIEW `tests/database.test.mjs`
- REVIEW `tests/e2e/module-10-browser.spec.mjs`
- REVIEW `tests/e2e/module-11-browser.spec.mjs`
- REVIEW `tests/e2e/module-17-browser.spec.mjs`
- REVIEW `tests/e2e/module-21-browser.spec.mjs`
- REVIEW `tests/e2e/module-4a-browser.spec.mjs`
- REVIEW `tests/e2e/module-4b-browser.spec.mjs`
- REVIEW `tests/e2e/module-6-browser.spec.mjs`
- REVIEW `tests/e2e/module-7-browser.spec.mjs`
- REVIEW `tests/e2e/module-8-browser.spec.mjs`
- REVIEW `tests/e2e/module-9-browser.spec.mjs`
- REVIEW `tests/final-21-budget-cost-b10.test.mjs`
- REVIEW `tests/final-21-database-cleanup.test.mjs`
- REVIEW `tests/final-21-finance-b9.test.mjs`
- REVIEW `tests/final-21-inventory-b12.test.mjs`
- REVIEW `tests/final-21-procurement.test.mjs`
- REVIEW `tests/final-21-repair-r3-excluded-scope.test.mjs`
- REVIEW `tests/final-21-repair-r5-production-cleanup.test.mjs`
- REVIEW `tests/final-21-scope.test.mjs`
- REVIEW `tests/final-21-simple-cost-categories.test.mjs`
- REVIEW `tests/integration/module-10-api.integration.test.mjs`
- REVIEW `tests/integration/module-11-api.integration.test.mjs`
- REVIEW `tests/integration/module-15a-api.integration.test.mjs`
- REVIEW `tests/integration/module-17-api.integration.test.mjs`
- REVIEW `tests/integration/module-21-api.integration.test.mjs`
- REVIEW `tests/integration/module-4a-api.integration.test.mjs`
- REVIEW `tests/integration/module-4b-api.integration.test.mjs`
- REVIEW `tests/integration/module-6-api.integration.test.mjs`
- REVIEW `tests/integration/module-7-api.integration.test.mjs`
- REVIEW `tests/integration/module-8-api.integration.test.mjs`
- REVIEW `tests/integration/module-9-api.integration.test.mjs`
- REVIEW `tests/module-10-static.test.mjs`
- REVIEW `tests/module-11-static.test.mjs`
- REVIEW `tests/module-17-static.test.mjs`
- REVIEW `tests/module-21-static.test.mjs`
- REVIEW `tests/module-3-static.test.mjs`
- REVIEW `tests/module-4a-static.test.mjs`
- REVIEW `tests/module-4b-static.test.mjs`
- REVIEW `tests/module-5-static.test.mjs`
- REVIEW `tests/module-6-static.test.mjs`
- REVIEW `tests/module-7-static.test.mjs`
- REVIEW `tests/module-8-static.test.mjs`
- REVIEW `tests/module-9-static.test.mjs`
- REVIEW `tests/pass-175-final-repair-audit.test.mjs`
- REVIEW `tests/pass-303-source-gap-freeze.test.mjs`
- REVIEW `tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs`
- REVIEW `tests/pass-359-module-6-durable-wbs-freeze-reopen.test.mjs`
- REVIEW `tests/pass-360-module-6-cost-type-archive-lifecycle.test.mjs`
- REVIEW `tests/pass-366-module-5-controlled-suspend-resume.test.mjs`
- REVIEW `tests/pass-379-stage-0-23-final-repair-acceptance.test.mjs`

### RFQ / Quotation
- REVIEW `packages/database/prisma/migration-gates.json`
- REVIEW `scripts/acceptance/verify-pass-361-module-7-budget-approval-draft-readback.mjs`
- REVIEW `scripts/acceptance/verify-pass-362-module-8-rfq-item-relational-integrity.mjs`
- REVIEW `scripts/acceptance/verify-pass-363-module-8-vendor-master-rfq-requisition-readback.mjs`
- REVIEW `scripts/acceptance/verify-pass-364-module-9-direct-purchase-exception.mjs`
- REVIEW `scripts/final-21/build-legacy-cleanup-manifest.mjs`
- REVIEW `scripts/module-11/verify-stage-16-contract.mjs`
- REVIEW `scripts/module-11/verify-stage-16.mjs`
- REVIEW `scripts/module-7/verify-stage-12.mjs`
- REVIEW `scripts/module-8/verify-stage-13-contract.mjs`
- REVIEW `scripts/module-8/verify-stage-13-http.mjs`
- REVIEW `scripts/module-8/verify-stage-13-integration-security.mjs`
- REVIEW `scripts/module-8/verify-stage-13-operations.mjs`
- REVIEW `scripts/module-8/verify-stage-13-persistence.mjs`
- REVIEW `scripts/module-8/verify-stage-13-playwright.mjs`
- REVIEW `scripts/module-8/verify-stage-13-react.mjs`
- REVIEW `scripts/module-8/verify-stage-13-repository.mjs`
- REVIEW `scripts/module-8/verify-stage-13-schema.mjs`
- REVIEW `scripts/module-8/verify-stage-13-service.mjs`
- REVIEW `scripts/module-8/verify-stage-13.mjs`
- REVIEW `scripts/module-9/verify-stage-14-contract.mjs`
- REVIEW `scripts/module-9/verify-stage-14-integration-security.mjs`
- REVIEW `scripts/module-9/verify-stage-14-operations.mjs`
- REVIEW `scripts/module-9/verify-stage-14-persistence.mjs`
- REVIEW `scripts/module-9/verify-stage-14-playwright.mjs`
- REVIEW `scripts/module-9/verify-stage-14-react.mjs`
- REVIEW `scripts/module-9/verify-stage-14-repository.mjs`
- REVIEW `scripts/module-9/verify-stage-14-schema.mjs`
- REVIEW `scripts/module-9/verify-stage-14-service.mjs`
- REVIEW `scripts/module-9/verify-stage-14.mjs`
- REVIEW `tests/config.test.mjs`
- REVIEW `tests/database.test.mjs`
- REVIEW `tests/e2e/module-10-browser.spec.mjs`
- REVIEW `tests/e2e/module-8-browser.spec.mjs`
- REVIEW `tests/e2e/module-9-browser.spec.mjs`
- REVIEW `tests/final-21-database-cleanup.test.mjs`
- REVIEW `tests/final-21-procurement-b11.test.mjs`
- REVIEW `tests/final-21-procurement.test.mjs`
- REVIEW `tests/final-21-scope.test.mjs`
- REVIEW `tests/integration/module-10-api.integration.test.mjs`
- REVIEW `tests/integration/module-8-api.integration.test.mjs`
- REVIEW `tests/integration/module-9-api.integration.test.mjs`
- REVIEW `tests/module-11-static.test.mjs`
- REVIEW `tests/module-7-static.test.mjs`
- REVIEW `tests/module-8-static.test.mjs`
- REVIEW `tests/module-9-static.test.mjs`
- REVIEW `tests/pass-303-source-gap-freeze.test.mjs`
- REVIEW `tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs`
- REVIEW `tests/pass-362-module-8-rfq-item-relational-integrity.test.mjs`
- REVIEW `tests/pass-363-module-8-vendor-master-rfq-requisition-readback.test.mjs`
- REVIEW `tests/pass-364-module-9-direct-purchase-exception.test.mjs`
- REVIEW `tests/pass-379-stage-0-23-final-repair-acceptance.test.mjs`
- REVIEW `tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs`
- REVIEW `tests/pass-413-module-10-durable-inventory-count-ui-readback.test.mjs`
- REVIEW `tests/pass-414-module-8-active-rfq-durable-readback.test.mjs`
- REVIEW `tests/pass-415-module-19-attachment-immutable-document-version-contract-freeze.test.mjs`

### Scheduling
- REVIEW `packages/database/prisma/migration-checksums.json`
- REVIEW `packages/database/prisma/migration-gates.json`
- REVIEW `packages/queue/src/types.ts`
- REVIEW `packages/queue/src/worker.ts`
- REVIEW `scripts/acceptance/verify-pass-366-module-5-controlled-suspend-resume.mjs`
- REVIEW `scripts/final-21/build-legacy-cleanup-manifest.mjs`
- REVIEW `scripts/module-17/verify-stage-22-contract.mjs`
- REVIEW `scripts/module-17/verify-stage-22-http.mjs`
- REVIEW `scripts/module-17/verify-stage-22-impact.mjs`
- REVIEW `scripts/module-17/verify-stage-22-integration-security.mjs`
- REVIEW `scripts/module-17/verify-stage-22-operations.mjs`
- REVIEW `scripts/module-17/verify-stage-22-persistence.mjs`
- REVIEW `scripts/module-17/verify-stage-22-playwright.mjs`
- REVIEW `scripts/module-17/verify-stage-22-react-data.mjs`
- REVIEW `scripts/module-17/verify-stage-22-react-workspace.mjs`
- REVIEW `scripts/module-17/verify-stage-22-repository.mjs`
- REVIEW `scripts/module-17/verify-stage-22-schema.mjs`
- REVIEW `scripts/module-17/verify-stage-22-service.mjs`
- REVIEW `scripts/module-17/verify-stage-22.mjs`
- REVIEW `scripts/module-21/verify-stage-21-contract.mjs`
- REVIEW `scripts/module-21/verify-stage-21-http.mjs`
- REVIEW `scripts/module-21/verify-stage-21-integration-security.mjs`
- REVIEW `scripts/module-21/verify-stage-21-operations.mjs`
- REVIEW `scripts/module-21/verify-stage-21-persistence.mjs`
- REVIEW `scripts/module-21/verify-stage-21-playwright.mjs`
- REVIEW `scripts/module-21/verify-stage-21-react-data.mjs`
- REVIEW `scripts/module-21/verify-stage-21-react.mjs`
- REVIEW `scripts/module-21/verify-stage-21-repository.mjs`
- REVIEW `scripts/module-21/verify-stage-21-schema.mjs`
- REVIEW `scripts/module-21/verify-stage-21-service.mjs`
- REVIEW `scripts/module-21/verify-stage-21.mjs`
- REVIEW `tests/database.test.mjs`
- REVIEW `tests/e2e/module-21-browser.spec.mjs`
- REVIEW `tests/final-21-database-cleanup.test.mjs`
- REVIEW `tests/final-21-equipment-b13.test.mjs`
- REVIEW `tests/final-21-repair-r5-production-cleanup.test.mjs`
- REVIEW `tests/final-21-scope.test.mjs`
- REVIEW `tests/integration/module-17-api.integration.test.mjs`
- REVIEW `tests/integration/module-21-api.integration.test.mjs`
- REVIEW `tests/integration/module-22-api.integration.test.mjs`
- REVIEW `tests/module-17-static.test.mjs`
- REVIEW `tests/module-21-static.test.mjs`
- REVIEW `tests/module-22-static.test.mjs`
- REVIEW `tests/module-5-static.test.mjs`
- REVIEW `tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs`
- REVIEW `tests/pass-366-module-5-controlled-suspend-resume.test.mjs`
- REVIEW `tests/pass-376-module-21-activity-owner-duration-baseline-reopen.test.mjs`
- REVIEW `tests/pass-378-stage-0-23-code-quality-audit.test.mjs`
- REVIEW `tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs`
- REVIEW `tests/pass-412-module-22-delegation-readback-implementation.test.mjs`

### Change Orders
- REVIEW `packages/database/prisma/migration-gates.json`
- REVIEW `scripts/acceptance/verify-pass-366-module-5-controlled-suspend-resume.mjs`
- REVIEW `scripts/final-21/build-legacy-cleanup-manifest.mjs`
- REVIEW `scripts/module-11/verify-stage-16-http.mjs`
- REVIEW `scripts/module-11/verify-stage-16-integration-security.mjs`
- REVIEW `scripts/module-11/verify-stage-16-operations.mjs`
- REVIEW `scripts/module-17/verify-stage-22-contract.mjs`
- REVIEW `scripts/module-17/verify-stage-22-http.mjs`
- REVIEW `scripts/module-17/verify-stage-22-impact.mjs`
- REVIEW `scripts/module-17/verify-stage-22-integration-security.mjs`
- REVIEW `scripts/module-17/verify-stage-22-operations.mjs`
- REVIEW `scripts/module-17/verify-stage-22-persistence.mjs`
- REVIEW `scripts/module-17/verify-stage-22-playwright.mjs`
- REVIEW `scripts/module-17/verify-stage-22-react-data.mjs`
- REVIEW `scripts/module-17/verify-stage-22-react-workspace.mjs`
- REVIEW `scripts/module-17/verify-stage-22-repository.mjs`
- REVIEW `scripts/module-17/verify-stage-22-schema.mjs`
- REVIEW `scripts/module-17/verify-stage-22-service.mjs`
- REVIEW `scripts/module-17/verify-stage-22.mjs`
- REVIEW `scripts/module-21/verify-stage-21-contract.mjs`
- REVIEW `scripts/module-21/verify-stage-21-http.mjs`
- REVIEW `scripts/module-21/verify-stage-21-integration-security.mjs`
- REVIEW `scripts/module-21/verify-stage-21-operations.mjs`
- REVIEW `scripts/module-21/verify-stage-21-persistence.mjs`
- REVIEW `scripts/module-21/verify-stage-21-playwright.mjs`
- REVIEW `scripts/module-21/verify-stage-21-react-data.mjs`
- REVIEW `scripts/module-21/verify-stage-21-react.mjs`
- REVIEW `scripts/module-21/verify-stage-21-repository.mjs`
- REVIEW `scripts/module-21/verify-stage-21-service.mjs`
- REVIEW `scripts/module-21/verify-stage-21.mjs`
- REVIEW `tests/config.test.mjs`
- REVIEW `tests/database.test.mjs`
- REVIEW `tests/e2e/module-17-browser.spec.mjs`
- REVIEW `tests/final-21-database-cleanup.test.mjs`
- REVIEW `tests/final-21-scope.test.mjs`
- REVIEW `tests/integration/module-17-api.integration.test.mjs`
- REVIEW `tests/module-11-static.test.mjs`
- REVIEW `tests/module-16-static.test.mjs`
- REVIEW `tests/module-17-static.test.mjs`
- REVIEW `tests/module-21-static.test.mjs`
- REVIEW `tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs`
- REVIEW `tests/pass-366-module-5-controlled-suspend-resume.test.mjs`
- REVIEW `tests/pass-370-module-11-readback-revision-retention.test.mjs`
- REVIEW `tests/pass-377-module-17-withdraw-history.test.mjs`
- REVIEW `tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs`
- REVIEW `tests/pass-412-module-22-delegation-readback-implementation.test.mjs`

### RFI / Submittals
- REVIEW `packages/database/prisma/migration-checksums.json`
- REVIEW `packages/database/prisma/migration-gates.json`
- REVIEW `scripts/final-21/build-legacy-cleanup-manifest.mjs`
- REVIEW `scripts/module-16/verify-stage-23.mjs`
- REVIEW `tests/database.test.mjs`
- REVIEW `tests/e2e/module-19-browser.spec.mjs`
- REVIEW `tests/final-21-database-cleanup.test.mjs`
- REVIEW `tests/final-21-repair-r5-production-cleanup.test.mjs`
- REVIEW `tests/final-21-scope.test.mjs`
- REVIEW `tests/integration/module-19-rfis-api.integration.test.mjs`
- REVIEW `tests/integration/module-19-submittals-api.integration.test.mjs`
- REVIEW `tests/integration/module-22-api.integration.test.mjs`
- REVIEW `tests/module-16-static.test.mjs`
- REVIEW `tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs`
- REVIEW `tests/pass-379-stage-0-23-final-repair-acceptance.test.mjs`
- REVIEW `tests/pass-390-module-19-submittal-repository.test.mjs`
- REVIEW `tests/pass-391-module-19-submittal-service.test.mjs`
- REVIEW `tests/pass-392-module-19-submittal-http-registration.test.mjs`
- REVIEW `tests/pass-393-module-19-submittal-backend-verification.test.mjs`
- REVIEW `tests/pass-394-module-19-remaining-contract-readback-freeze.test.mjs`
- REVIEW `tests/pass-395-module-19-rfi-persistence.test.mjs`
- REVIEW `tests/pass-396-module-19-rfi-schema.test.mjs`
- REVIEW `tests/pass-397-module-19-rfi-repository.test.mjs`
- REVIEW `tests/pass-398-module-19-rfi-service.test.mjs`
- REVIEW `tests/pass-399-module-19-rfi-fastify-routes-openapi.test.mjs`
- REVIEW `tests/pass-400-module-19-rfi-backend-integration-verification.test.mjs`
- REVIEW `tests/pass-401-module-19-detail-history-readback.test.mjs`
- REVIEW `tests/pass-402-module-19-react-typed-api-client.test.mjs`
- REVIEW `tests/pass-403-module-19-tanstack-query-hooks.test.mjs`
- REVIEW `tests/pass-404-module-19-react-ui.test.mjs`
- REVIEW `tests/pass-405-module-19-routing-navigation-permission-guards.test.mjs`
- REVIEW `tests/pass-406-module-19-playwright-workflow.test.mjs`
- REVIEW `tests/pass-407-stage-24-module-19-final-acceptance.test.mjs`
- REVIEW `tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs`
- REVIEW `tests/pass-409-current-static-test-supersession-hygiene.test.mjs`
- REVIEW `tests/pass-415-module-19-attachment-immutable-document-version-contract-freeze.test.mjs`
- REVIEW `tests/stage-2-pass-2.4-security-isolation.test.mjs`

### CRM Opportunities
- REVIEW `packages/database/prisma/migration-gates.json`
- REVIEW `scripts/final-21/build-legacy-cleanup-manifest.mjs`
- REVIEW `scripts/module-2/verify-stage-4.mjs`
- REVIEW `tests/database.test.mjs`
- REVIEW `tests/e2e/module-2-browser.spec.mjs`
- REVIEW `tests/e2e/module-3-browser.spec.mjs`
- REVIEW `tests/e2e/module-4b-browser.spec.mjs`
- REVIEW `tests/final-21-client-management.test.mjs`
- REVIEW `tests/final-21-database-cleanup.test.mjs`
- REVIEW `tests/final-21-repair-r5-production-cleanup.test.mjs`
- REVIEW `tests/final-21-scope.test.mjs`
- REVIEW `tests/integration/module-2-api.integration.test.mjs`
- REVIEW `tests/integration/module-3-api.integration.test.mjs`
- REVIEW `tests/integration/module-4a-api.integration.test.mjs`
- REVIEW `tests/integration/module-4b-api.integration.test.mjs`
- REVIEW `tests/integration/module-5-api.integration.test.mjs`
- REVIEW `tests/module-2-static.test.mjs`
- REVIEW `tests/module-3-static.test.mjs`
- REVIEW `tests/module-5-static.test.mjs`
- REVIEW `tests/pass-175-final-repair-audit.test.mjs`

### Client Contract
- REVIEW `scripts/final-21/build-legacy-cleanup-manifest.mjs`
- REVIEW `scripts/module-16/verify-stage-23-contract.mjs`
- REVIEW `scripts/module-16/verify-stage-23-persistence.mjs`
- REVIEW `scripts/module-16/verify-stage-23-schema.mjs`
- REVIEW `scripts/module-16/verify-stage-23-service.mjs`
- REVIEW `scripts/module-16/verify-stage-23.mjs`
- REVIEW `tests/database.test.mjs`
- REVIEW `tests/e2e/module-16-browser.spec.mjs`
- REVIEW `tests/final-21-client-billing-b17-1-baseline.test.mjs`
- REVIEW `tests/final-21-client-billing.test.mjs`
- REVIEW `tests/final-21-database-cleanup.test.mjs`
- REVIEW `tests/integration/module-16-api.integration.test.mjs`
- REVIEW `tests/module-16-static.test.mjs`
- REVIEW `tests/module-17-static.test.mjs`
- REVIEW `tests/pass-375-module-16-claim-submit-contract-maintenance.test.mjs`

## E. Inventory coverage

- [x] Full-delete backend/frontend modules inventoried.
- [x] Current routes inventoried.
- [x] Named functions/components inventoried and marked DELETE/MOVE/KEEP for mixed modules.
- [x] Legacy Prisma models inventoried.
- [x] Non-legacy Prisma relations that still point at legacy models/fields inventoried.
- [x] Cross-cutting source/tests mentioning legacy concepts inventoried.
- [x] No production business logic removed in Pass A1.
- [x] No historical migration removed or rewritten in Pass A1.
