-- Pass 365: preserve exact controlled-revision line history and durable Purchase Order cancellation evidence.
-- This repair does not add a route, permission, business module, Finance adapter or Stage-27 integration.

ALTER TABLE "purchase_orders"
ADD COLUMN "cancel_reason" TEXT,
ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN "cancelled_by" UUID;

-- Recover existing cancellation evidence from the immutable Foundation audit trail when available.
WITH latest_cancellation AS (
    SELECT DISTINCT ON ("entity_id")
           "entity_id",
           "actor_user_id",
           "created_at",
           NULLIF(btrim("after_value" ->> 'reason'), '') AS "reason"
      FROM "audit_logs"
     WHERE "entity_type" = 'purchase_order'
       AND "action" = 'purchase_order.cancelled'
     ORDER BY "entity_id", "created_at" DESC, "id" DESC
)
UPDATE "purchase_orders" po
   SET "cancel_reason" = COALESCE(audit."reason", 'Legacy Purchase Order cancellation; original reason was not captured before Pass 365.'),
       "cancelled_at" = audit."created_at",
       "cancelled_by" = audit."actor_user_id"
  FROM latest_cancellation audit
 WHERE po."status" = 'CANCELLED'
   AND audit."entity_id" = po."id"::text;

-- Preserve truthful legacy state if an old cancelled PO has no recoverable audit row.
UPDATE "purchase_orders"
   SET "cancel_reason" = 'Legacy Purchase Order cancellation; original reason was not captured before Pass 365.'
 WHERE "status" = 'CANCELLED'
   AND "cancel_reason" IS NULL;

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_cancel_reason_not_blank"
CHECK ("cancel_reason" IS NULL OR length(btrim("cancel_reason")) > 0),
ADD CONSTRAINT "purchase_orders_cancel_evidence_state_ck"
CHECK (
    ("status" = 'CANCELLED' AND "cancel_reason" IS NOT NULL)
    OR
    ("status" <> 'CANCELLED' AND "cancel_reason" IS NULL AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL)
),
ADD CONSTRAINT "purchase_orders_cancelled_by_fkey"
FOREIGN KEY ("cancelled_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "purchase_orders_cancelled_by_at_idx"
    ON "purchase_orders"("cancelled_by", "cancelled_at");

CREATE TABLE "purchase_order_revision_items" (
    "id" UUID NOT NULL,
    "purchase_order_revision_id" UUID NOT NULL,
    "snapshot_side" VARCHAR(16) NOT NULL,
    "line_no" INTEGER NOT NULL,
    "source_item_id" UUID,
    "item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" VARCHAR(64) NOT NULL,
    "unit_rate" DECIMAL(18,4) NOT NULL,
    "tax_rate" DECIMAL(18,4) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,
    "wbs_node_id" UUID NOT NULL,
    "cost_code_id" UUID NOT NULL,
    "cost_type_id" UUID NOT NULL,
    "received_qty" DECIMAL(18,4) NOT NULL,
    "invoiced_amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "purchase_order_revision_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_revision_items_side_ck" CHECK ("snapshot_side" IN ('BEFORE', 'AFTER')),
    CONSTRAINT "purchase_order_revision_items_line_no_positive" CHECK ("line_no" > 0),
    CONSTRAINT "purchase_order_revision_items_description_not_blank" CHECK (length(btrim("description")) > 0),
    CONSTRAINT "purchase_order_revision_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "purchase_order_revision_items_unit_not_blank" CHECK (length(btrim("unit")) > 0),
    CONSTRAINT "purchase_order_revision_items_unit_rate_nonnegative" CHECK ("unit_rate" >= 0),
    CONSTRAINT "purchase_order_revision_items_tax_rate_nonnegative" CHECK ("tax_rate" >= 0),
    CONSTRAINT "purchase_order_revision_items_line_total_nonnegative" CHECK ("line_total" >= 0),
    CONSTRAINT "purchase_order_revision_items_received_qty_nonnegative" CHECK ("received_qty" >= 0),
    CONSTRAINT "purchase_order_revision_items_invoiced_amount_nonnegative" CHECK ("invoiced_amount" >= 0)
);

CREATE UNIQUE INDEX "purchase_order_revision_items_revision_side_line_uq"
    ON "purchase_order_revision_items"("purchase_order_revision_id", "snapshot_side", "line_no");
CREATE INDEX "purchase_order_revision_items_revision_side_idx"
    ON "purchase_order_revision_items"("purchase_order_revision_id", "snapshot_side");

ALTER TABLE "purchase_order_revision_items"
ADD CONSTRAINT "purchase_order_revision_items_revision_fkey"
FOREIGN KEY ("purchase_order_revision_id") REFERENCES "purchase_order_revisions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Recover existing line snapshots from the detailed before/after audit payloads written by earlier Module-9 revisions.
WITH revision_audit AS (
    SELECT revision."id" AS "revision_id",
           audit."before_value",
           audit."after_value"
      FROM "purchase_order_revisions" revision
      JOIN LATERAL (
          SELECT log."before_value", log."after_value"
            FROM "audit_logs" log
           WHERE log."entity_type" = 'purchase_order'
             AND log."action" = 'purchase_order.revised'
             AND log."entity_id" = revision."purchase_order_id"::text
             AND COALESCE((log."after_value" ->> 'revisionNo')::integer, 0) = revision."revision_no"
           ORDER BY log."created_at" ASC, log."id" ASC
           LIMIT 1
      ) audit ON TRUE
)
INSERT INTO "purchase_order_revision_items" (
    "id", "purchase_order_revision_id", "snapshot_side", "line_no", "source_item_id", "item_id",
    "description", "quantity", "unit", "unit_rate", "tax_rate", "line_total",
    "wbs_node_id", "cost_code_id", "cost_type_id", "received_qty", "invoiced_amount"
)
SELECT gen_random_uuid(), revision_audit."revision_id", 'BEFORE', line."ordinality"::integer,
       NULLIF(line."item" ->> 'id', '')::uuid,
       NULLIF(line."item" ->> 'itemId', '')::uuid,
       line."item" ->> 'description',
       (line."item" ->> 'quantity')::decimal(18,4),
       line."item" ->> 'unit',
       (line."item" ->> 'unitRate')::decimal(18,4),
       (line."item" ->> 'taxRate')::decimal(18,4),
       (line."item" ->> 'lineTotal')::decimal(18,2),
       (line."item" ->> 'wbsNodeId')::uuid,
       (line."item" ->> 'costCodeId')::uuid,
       (line."item" ->> 'costTypeId')::uuid,
       (line."item" ->> 'receivedQty')::decimal(18,4),
       (line."item" ->> 'invoicedAmount')::decimal(18,2)
  FROM revision_audit
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(revision_audit."before_value" -> 'items', '[]'::jsonb))
      WITH ORDINALITY AS line("item", "ordinality")
ON CONFLICT ("purchase_order_revision_id", "snapshot_side", "line_no") DO NOTHING;

WITH revision_audit AS (
    SELECT revision."id" AS "revision_id",
           audit."after_value"
      FROM "purchase_order_revisions" revision
      JOIN LATERAL (
          SELECT log."after_value"
            FROM "audit_logs" log
           WHERE log."entity_type" = 'purchase_order'
             AND log."action" = 'purchase_order.revised'
             AND log."entity_id" = revision."purchase_order_id"::text
             AND COALESCE((log."after_value" ->> 'revisionNo')::integer, 0) = revision."revision_no"
           ORDER BY log."created_at" ASC, log."id" ASC
           LIMIT 1
      ) audit ON TRUE
)
INSERT INTO "purchase_order_revision_items" (
    "id", "purchase_order_revision_id", "snapshot_side", "line_no", "source_item_id", "item_id",
    "description", "quantity", "unit", "unit_rate", "tax_rate", "line_total",
    "wbs_node_id", "cost_code_id", "cost_type_id", "received_qty", "invoiced_amount"
)
SELECT gen_random_uuid(), revision_audit."revision_id", 'AFTER', line."ordinality"::integer,
       NULLIF(line."item" ->> 'id', '')::uuid,
       NULLIF(line."item" ->> 'itemId', '')::uuid,
       line."item" ->> 'description',
       (line."item" ->> 'quantity')::decimal(18,4),
       line."item" ->> 'unit',
       (line."item" ->> 'unitRate')::decimal(18,4),
       (line."item" ->> 'taxRate')::decimal(18,4),
       (line."item" ->> 'lineTotal')::decimal(18,2),
       (line."item" ->> 'wbsNodeId')::uuid,
       (line."item" ->> 'costCodeId')::uuid,
       (line."item" ->> 'costTypeId')::uuid,
       (line."item" ->> 'receivedQty')::decimal(18,4),
       (line."item" ->> 'invoicedAmount')::decimal(18,2)
  FROM revision_audit
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(revision_audit."after_value" -> 'items', '[]'::jsonb))
      WITH ORDINALITY AS line("item", "ordinality")
ON CONFLICT ("purchase_order_revision_id", "snapshot_side", "line_no") DO NOTHING;

-- Cancellation evidence must be complete for every new transition and cannot be rewritten after cancellation.
CREATE FUNCTION "module_9_validate_po_cancellation_evidence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    canceller_company_id UUID;
BEGIN
    IF NEW."status" = 'CANCELLED' THEN
        IF NEW."cancel_reason" IS NULL OR length(btrim(NEW."cancel_reason")) = 0
           OR NEW."cancelled_at" IS NULL OR NEW."cancelled_by" IS NULL THEN
            RAISE EXCEPTION 'Cancelled Purchase Order requires durable reason, actor and timestamp evidence'
                USING ERRCODE = '23514';
        END IF;

        SELECT "company_id" INTO canceller_company_id
          FROM "users"
         WHERE "id" = NEW."cancelled_by";
        IF canceller_company_id IS DISTINCT FROM NEW."company_id" THEN
            RAISE EXCEPTION 'Purchase Order cancellation actor must belong to the same Company'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD."status" = 'CANCELLED' AND (
        NEW."status" IS DISTINCT FROM OLD."status"
        OR NEW."cancel_reason" IS DISTINCT FROM OLD."cancel_reason"
        OR NEW."cancelled_at" IS DISTINCT FROM OLD."cancelled_at"
        OR NEW."cancelled_by" IS DISTINCT FROM OLD."cancelled_by"
    ) THEN
        RAISE EXCEPTION 'Purchase Order cancellation evidence is immutable after cancellation'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_orders_cancellation_evidence_integrity"
BEFORE INSERT OR UPDATE OF "status", "cancel_reason", "cancelled_at", "cancelled_by", "company_id"
ON "purchase_orders"
FOR EACH ROW
EXECUTE FUNCTION "module_9_validate_po_cancellation_evidence"();

-- Controlled revision headers and line snapshots are immutable commercial history.
CREATE FUNCTION "module_9_block_po_revision_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Purchase Order revision history is immutable'
        USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "purchase_order_revisions_immutable"
BEFORE UPDATE OR DELETE ON "purchase_order_revisions"
FOR EACH ROW
EXECUTE FUNCTION "module_9_block_po_revision_history_mutation"();

CREATE TRIGGER "purchase_order_revision_items_immutable"
BEFORE UPDATE OR DELETE ON "purchase_order_revision_items"
FOR EACH ROW
EXECUTE FUNCTION "module_9_block_po_revision_history_mutation"();
