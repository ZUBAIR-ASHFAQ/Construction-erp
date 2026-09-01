-- Pass 362 / Module 8 repair - RFQ item relational integrity.
-- The Stage-13 source requires supplier_quotation_items.rfq_item_id but omitted the target table.
-- Pass 358 explicitly authorized this smallest structural amendment before Stage 24.
-- This migration creates only RFQ line snapshot persistence, safely maps historical opaque ids,
-- and enforces that every supplier quotation line points to an item owned by the same RFQ.

CREATE TABLE "rfq_items" (
    "id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "requisition_item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" VARCHAR(64) NOT NULL,

    CONSTRAINT "rfq_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rfq_items_description_not_blank" CHECK (length(btrim("description")) > 0),
    CONSTRAINT "rfq_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "rfq_items_unit_not_blank" CHECK (length(btrim("unit")) > 0)
);

CREATE UNIQUE INDEX "rfq_items_rfq_requisition_item_uq"
    ON "rfq_items"("rfq_id", "requisition_item_id");
CREATE INDEX "rfq_items_rfq_idx" ON "rfq_items"("rfq_id");
CREATE INDEX "rfq_items_requisition_item_idx" ON "rfq_items"("requisition_item_id");

ALTER TABLE "rfq_items"
    ADD CONSTRAINT "rfq_items_rfq_fkey"
        FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "rfq_items_requisition_item_fkey"
        FOREIGN KEY ("requisition_item_id") REFERENCES "purchase_requisition_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve historical quotation identity without assuming the old opaque UUID was a requisition item id.
-- The same old UUID could have been reused by different RFQs, so the mapping is scoped by RFQ.
CREATE TEMP TABLE "module_8_rfq_item_backfill_map" (
    "rfq_id" UUID NOT NULL,
    "old_rfq_item_id" UUID NOT NULL,
    "new_rfq_item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    PRIMARY KEY ("rfq_id", "old_rfq_item_id")
) ON COMMIT DROP;

INSERT INTO "module_8_rfq_item_backfill_map" (
    "rfq_id",
    "old_rfq_item_id",
    "new_rfq_item_id",
    "quantity"
)
SELECT grouped."rfq_id",
       grouped."old_rfq_item_id",
       CASE
           WHEN identity_use."rfq_count" = 1 THEN grouped."old_rfq_item_id"
           ELSE gen_random_uuid()
       END,
       grouped."quantity"
FROM (
    SELECT quotation."rfq_id",
           quotation_item."rfq_item_id" AS "old_rfq_item_id",
           MIN(quotation_item."quantity") AS "quantity"
      FROM "supplier_quotation_items" quotation_item
      JOIN "supplier_quotations" quotation
        ON quotation."id" = quotation_item."quotation_id"
     GROUP BY quotation."rfq_id", quotation_item."rfq_item_id"
) grouped
JOIN (
    SELECT quotation_item."rfq_item_id" AS "old_rfq_item_id",
           COUNT(DISTINCT quotation."rfq_id") AS "rfq_count"
      FROM "supplier_quotation_items" quotation_item
      JOIN "supplier_quotations" quotation
        ON quotation."id" = quotation_item."quotation_id"
     GROUP BY quotation_item."rfq_item_id"
) identity_use
  ON identity_use."old_rfq_item_id" = grouped."old_rfq_item_id";

INSERT INTO "rfq_items" (
    "id",
    "rfq_id",
    "requisition_item_id",
    "description",
    "quantity",
    "unit"
)
SELECT mapping."new_rfq_item_id",
       mapping."rfq_id",
       CASE
           WHEN requisition_item."id" IS NOT NULL
                AND requisition_item."requisition_id" = rfq."requisition_id"
             THEN requisition_item."id"
           ELSE NULL
       END,
       COALESCE(requisition_item."description", 'Migrated RFQ line ' || mapping."old_rfq_item_id"::text),
       COALESCE(requisition_item."quantity", mapping."quantity"),
       COALESCE(requisition_item."unit", 'legacy')
  FROM "module_8_rfq_item_backfill_map" mapping
  JOIN "rfqs" rfq
    ON rfq."id" = mapping."rfq_id"
  LEFT JOIN "purchase_requisition_items" requisition_item
    ON requisition_item."id" = mapping."old_rfq_item_id";

UPDATE "supplier_quotation_items" quotation_item
   SET "rfq_item_id" = mapping."new_rfq_item_id"
  FROM "supplier_quotations" quotation,
       "module_8_rfq_item_backfill_map" mapping
 WHERE quotation."id" = quotation_item."quotation_id"
   AND mapping."rfq_id" = quotation."rfq_id"
   AND mapping."old_rfq_item_id" = quotation_item."rfq_item_id";

-- Existing RFQs that have a requisition but no quotation history receive a real requisition-derived snapshot.
INSERT INTO "rfq_items" (
    "id",
    "rfq_id",
    "requisition_item_id",
    "description",
    "quantity",
    "unit"
)
SELECT gen_random_uuid(),
       rfq."id",
       requisition_item."id",
       requisition_item."description",
       requisition_item."quantity",
       requisition_item."unit"
  FROM "rfqs" rfq
  JOIN "purchase_requisition_items" requisition_item
    ON requisition_item."requisition_id" = rfq."requisition_id"
 WHERE rfq."requisition_id" IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
         FROM "rfq_items" existing
        WHERE existing."rfq_id" = rfq."id"
   );

DROP INDEX "supplier_quotation_items_unresolved_rfq_item_idx";
CREATE INDEX "supplier_quotation_items_rfq_item_idx"
    ON "supplier_quotation_items"("rfq_item_id");

ALTER TABLE "supplier_quotation_items"
    ADD CONSTRAINT "supplier_quotation_items_rfq_item_fkey"
        FOREIGN KEY ("rfq_item_id") REFERENCES "rfq_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- A requisition-derived RFQ line may reference only an item from the RFQ's own source requisition.
CREATE FUNCTION "module_8_validate_rfq_item_requisition_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    rfq_requisition_id UUID;
    source_requisition_id UUID;
    already_quoted BOOLEAN;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW."rfq_id" IS DISTINCT FROM OLD."rfq_id" THEN
        SELECT EXISTS (
            SELECT 1
              FROM "supplier_quotation_items"
             WHERE "rfq_item_id" = OLD."id"
        ) INTO already_quoted;

        IF already_quoted THEN
            RAISE EXCEPTION 'Referenced RFQ item cannot move to another RFQ'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."requisition_item_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "requisition_id"
      INTO rfq_requisition_id
      FROM "rfqs"
     WHERE "id" = NEW."rfq_id";

    SELECT "requisition_id"
      INTO source_requisition_id
      FROM "purchase_requisition_items"
     WHERE "id" = NEW."requisition_item_id";

    IF rfq_requisition_id IS NULL
       OR source_requisition_id IS DISTINCT FROM rfq_requisition_id THEN
        RAISE EXCEPTION 'RFQ item must come from the RFQ source requisition'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "rfq_items_requisition_scope_integrity"
BEFORE INSERT OR UPDATE OF "rfq_id", "requisition_item_id"
ON "rfq_items"
FOR EACH ROW
EXECUTE FUNCTION "module_8_validate_rfq_item_requisition_scope"();

-- Every quotation line must belong to the exact same RFQ as its quotation header.
CREATE FUNCTION "module_8_validate_supplier_quotation_item_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    quotation_rfq_id UUID;
    item_rfq_id UUID;
BEGIN
    SELECT "rfq_id"
      INTO quotation_rfq_id
      FROM "supplier_quotations"
     WHERE "id" = NEW."quotation_id";

    SELECT "rfq_id"
      INTO item_rfq_id
      FROM "rfq_items"
     WHERE "id" = NEW."rfq_item_id";

    IF quotation_rfq_id IS NULL
       OR item_rfq_id IS NULL
       OR item_rfq_id IS DISTINCT FROM quotation_rfq_id THEN
        RAISE EXCEPTION 'Supplier quotation item must belong to the same RFQ as the quotation'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "supplier_quotation_items_rfq_scope_integrity"
BEFORE INSERT OR UPDATE OF "quotation_id", "rfq_item_id"
ON "supplier_quotation_items"
FOR EACH ROW
EXECUTE FUNCTION "module_8_validate_supplier_quotation_item_scope"();

-- Moving a quotation header to another RFQ cannot strand its already-recorded quotation lines.
CREATE FUNCTION "module_8_validate_supplier_quotation_header_item_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."rfq_id" IS DISTINCT FROM OLD."rfq_id"
       AND EXISTS (
           SELECT 1
             FROM "supplier_quotation_items" quotation_item
             JOIN "rfq_items" rfq_item
               ON rfq_item."id" = quotation_item."rfq_item_id"
            WHERE quotation_item."quotation_id" = OLD."id"
              AND rfq_item."rfq_id" IS DISTINCT FROM NEW."rfq_id"
       ) THEN
        RAISE EXCEPTION 'Supplier quotation cannot move away from its RFQ items'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "supplier_quotations_rfq_item_scope_integrity"
BEFORE UPDATE OF "rfq_id"
ON "supplier_quotations"
FOR EACH ROW
EXECUTE FUNCTION "module_8_validate_supplier_quotation_header_item_scope"();
