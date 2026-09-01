-- Stage 22 / Module 17 - Change Orders / Variations core persistence.
-- Creates exactly the four reviewed Change Order resources with Project, cost-structure and optional BOQ relationships.
-- Status/type vocabularies, target adapters, Client Billing integration and Stage-27 reversal policy remain intentionally deferred.

CREATE TABLE "change_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "change_no" VARCHAR(100) NOT NULL,
    "change_type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "change_requests_change_no_not_blank" CHECK (length(btrim("change_no")) > 0),
    CONSTRAINT "change_requests_change_type_not_blank" CHECK (length(btrim("change_type")) > 0),
    CONSTRAINT "change_requests_title_not_blank" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "change_requests_description_not_blank" CHECK (length(btrim("description")) > 0),
    CONSTRAINT "change_requests_reason_not_blank" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "change_requests_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "change_request_lines" (
    "id" UUID NOT NULL,
    "change_request_id" UUID NOT NULL,
    "wbs_node_id" UUID,
    "cost_code_id" UUID,
    "cost_type_id" UUID,
    "description" TEXT NOT NULL,
    "cost_amount" DECIMAL(18,2) NOT NULL,
    "revenue_amount" DECIMAL(18,2) NOT NULL,
    "boq_item_id" UUID,

    CONSTRAINT "change_request_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "change_request_lines_description_not_blank" CHECK (length(btrim("description")) > 0)
);

CREATE TABLE "change_orders" (
    "id" UUID NOT NULL,
    "change_request_id" UUID NOT NULL,
    "approved_cost" DECIMAL(18,2) NOT NULL,
    "approved_revenue" DECIMAL(18,2) NOT NULL,
    "approved_days" DECIMAL(10,2),
    "approved_at" TIMESTAMPTZ(6) NOT NULL,
    "effective_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "change_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "change_orders_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "change_order_impacts" (
    "id" UUID NOT NULL,
    "change_order_id" UUID NOT NULL,
    "target_type" VARCHAR(100) NOT NULL,
    "target_id" UUID NOT NULL,
    "amount_delta" DECIMAL(18,2) NOT NULL,
    "quantity_delta" DECIMAL(18,4),
    "applied_at" TIMESTAMPTZ(6),
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "change_order_impacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "change_order_impacts_target_type_not_blank" CHECK (length(btrim("target_type")) > 0),
    CONSTRAINT "change_order_impacts_status_not_blank" CHECK (length(btrim("status")) > 0)
);

-- change_no uniqueness is intentionally not invented because the source does not define its numbering scope.
CREATE INDEX "change_requests_company_change_no_idx"
    ON "change_requests"("company_id", "change_no");
CREATE INDEX "change_requests_company_status_requested_idx"
    ON "change_requests"("company_id", "status", "requested_at");
CREATE INDEX "change_requests_project_status_requested_idx"
    ON "change_requests"("project_id", "status", "requested_at");
CREATE INDEX "change_requests_requester_requested_idx"
    ON "change_requests"("requested_by", "requested_at");

CREATE INDEX "change_request_lines_request_idx"
    ON "change_request_lines"("change_request_id");
CREATE INDEX "change_request_lines_wbs_cost_idx"
    ON "change_request_lines"("wbs_node_id", "cost_code_id", "cost_type_id");
CREATE INDEX "change_request_lines_boq_item_idx"
    ON "change_request_lines"("boq_item_id");

-- One approved request issues one formal Change Order; retries cannot create another snapshot.
CREATE UNIQUE INDEX "change_orders_request_uq"
    ON "change_orders"("change_request_id");
CREATE INDEX "change_orders_effective_status_idx"
    ON "change_orders"("effective_date", "status");

CREATE INDEX "change_order_impacts_order_status_idx"
    ON "change_order_impacts"("change_order_id", "status");
CREATE INDEX "change_order_impacts_target_idx"
    ON "change_order_impacts"("target_type", "target_id");
CREATE INDEX "change_order_impacts_applied_idx"
    ON "change_order_impacts"("applied_at");

ALTER TABLE "change_requests"
    ADD CONSTRAINT "change_requests_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "change_requests_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "change_requests_requester_company_fkey"
        FOREIGN KEY ("requested_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "change_request_lines"
    ADD CONSTRAINT "change_request_lines_request_fkey"
        FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "change_request_lines_wbs_node_fkey"
        FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "change_request_lines_cost_code_fkey"
        FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "change_request_lines_cost_type_fkey"
        FOREIGN KEY ("cost_type_id") REFERENCES "cost_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "change_request_lines_boq_item_fkey"
        FOREIGN KEY ("boq_item_id") REFERENCES "boq_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "change_orders"
    ADD CONSTRAINT "change_orders_request_fkey"
        FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "change_order_impacts"
    ADD CONSTRAINT "change_order_impacts_order_fkey"
        FOREIGN KEY ("change_order_id") REFERENCES "change_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purpose: keep optional WBS, Cost Code, Cost Type and BOQ references inside the Change Request Project and Company.
CREATE FUNCTION "module_17_validate_change_request_line_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    request_company_id UUID;
    request_project_id UUID;
    wbs_company_id UUID;
    wbs_project_id UUID;
    cost_code_company_id UUID;
    cost_type_company_id UUID;
    boq_company_id UUID;
    boq_project_id UUID;
BEGIN
    SELECT "company_id", "project_id"
      INTO request_company_id, request_project_id
      FROM "change_requests"
     WHERE "id" = NEW."change_request_id";

    IF NEW."wbs_node_id" IS NOT NULL THEN
        SELECT "company_id", "project_id"
          INTO wbs_company_id, wbs_project_id
          FROM "wbs_nodes"
         WHERE "id" = NEW."wbs_node_id";

        IF wbs_company_id IS DISTINCT FROM request_company_id
           OR wbs_project_id IS DISTINCT FROM request_project_id THEN
            RAISE EXCEPTION 'Change Request WBS node must belong to the Change Request Company and Project'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."cost_code_id" IS NOT NULL THEN
        SELECT "company_id" INTO cost_code_company_id
          FROM "cost_codes"
         WHERE "id" = NEW."cost_code_id";

        IF cost_code_company_id IS DISTINCT FROM request_company_id THEN
            RAISE EXCEPTION 'Change Request Cost Code must belong to the Change Request Company'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."cost_type_id" IS NOT NULL THEN
        SELECT "company_id" INTO cost_type_company_id
          FROM "cost_types"
         WHERE "id" = NEW."cost_type_id";

        IF cost_type_company_id IS DISTINCT FROM request_company_id THEN
            RAISE EXCEPTION 'Change Request Cost Type must belong to the Change Request Company'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."wbs_node_id" IS NOT NULL
       AND NEW."cost_code_id" IS NOT NULL
       AND NEW."cost_type_id" IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM "project_cost_codes" mapping
             WHERE mapping."project_id" = request_project_id
               AND mapping."wbs_node_id" = NEW."wbs_node_id"
               AND mapping."cost_code_id" = NEW."cost_code_id"
               AND mapping."cost_type_id" = NEW."cost_type_id"
               AND mapping."is_posting_allowed" = TRUE
       ) THEN
        RAISE EXCEPTION 'Change Request line must use a posting-enabled Project cost-code combination'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."boq_item_id" IS NOT NULL THEN
        SELECT boq."company_id", boq."project_id"
          INTO boq_company_id, boq_project_id
          FROM "boq_items" item
          JOIN "boq_revisions" revision ON revision."id" = item."boq_revision_id"
          JOIN "boqs" boq ON boq."id" = revision."boq_id"
         WHERE item."id" = NEW."boq_item_id";

        IF boq_company_id IS DISTINCT FROM request_company_id
           OR boq_project_id IS DISTINCT FROM request_project_id THEN
            RAISE EXCEPTION 'Change Request BOQ item must belong to a Project-mapped BOQ for the Change Request Project'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "change_request_lines_scope_integrity"
BEFORE INSERT OR UPDATE OF "change_request_id", "wbs_node_id", "cost_code_id", "cost_type_id", "boq_item_id"
ON "change_request_lines"
FOR EACH ROW
EXECUTE FUNCTION "module_17_validate_change_request_line_scope"();

-- Purpose: preserve the approved Change Order values as an immutable historical snapshot.
CREATE FUNCTION "module_17_reject_change_order_snapshot_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Approved Change Order snapshots are immutable'
        USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "change_orders_immutable_snapshot"
BEFORE UPDATE OR DELETE ON "change_orders"
FOR EACH ROW
EXECUTE FUNCTION "module_17_reject_change_order_snapshot_mutation"();

-- Purpose: keep impact identity/value history immutable and allow applied state to move forward only once.
CREATE FUNCTION "module_17_validate_change_order_impact_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Change Order impact history cannot be deleted'
            USING ERRCODE = '23514';
    END IF;

    IF OLD."applied_at" IS NOT NULL THEN
        RAISE EXCEPTION 'Applied Change Order impacts are immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."change_order_id" IS DISTINCT FROM OLD."change_order_id"
       OR NEW."target_type" IS DISTINCT FROM OLD."target_type"
       OR NEW."target_id" IS DISTINCT FROM OLD."target_id"
       OR NEW."amount_delta" IS DISTINCT FROM OLD."amount_delta"
       OR NEW."quantity_delta" IS DISTINCT FROM OLD."quantity_delta" THEN
        RAISE EXCEPTION 'Change Order impact identity and values are immutable'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "change_order_impacts_history_integrity"
BEFORE UPDATE OR DELETE ON "change_order_impacts"
FOR EACH ROW
EXECUTE FUNCTION "module_17_validate_change_order_impact_update"();
