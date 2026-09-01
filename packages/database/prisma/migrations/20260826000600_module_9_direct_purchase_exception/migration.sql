-- Pass 364: make the source-defined direct-purchase Purchase Order exception explicit and auditable.
ALTER TABLE "purchase_orders"
ADD COLUMN "direct_purchase_reason" TEXT;

-- Preserve any legacy quotation-less PO without pretending its historical reason is known.
UPDATE "purchase_orders"
SET "direct_purchase_reason" = 'Legacy quotation-less Purchase Order; original direct-purchase reason was not captured before Pass 364.'
WHERE "quotation_id" IS NULL
  AND "direct_purchase_reason" IS NULL;

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_direct_purchase_reason_not_blank"
CHECK (
  "direct_purchase_reason" IS NULL
  OR length(btrim("direct_purchase_reason")) > 0
),
ADD CONSTRAINT "purchase_orders_purchase_source_ck"
CHECK (
  ("quotation_id" IS NOT NULL AND "direct_purchase_reason" IS NULL)
  OR
  ("quotation_id" IS NULL AND "direct_purchase_reason" IS NOT NULL)
);

-- The source requires explicit direct-purchase authority. Do not grant it to any role automatically.
INSERT INTO "permissions" ("id", "code", "name", "domain")
VALUES (
  gen_random_uuid(),
  'purchase_orders.direct_purchase',
  'Direct Purchase Exception',
  'purchase_orders'
)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "domain" = EXCLUDED."domain";
