-- Repair the Final-21 Material Requirement counter for companies upgraded from legacy Procurement.
-- Preserve the legacy counter position so the first new requirement cannot reuse an existing PR number.
INSERT INTO "number_sequences" (
  "id",
  "company_id",
  "sequence_key",
  "prefix",
  "suffix",
  "pad_width",
  "next_value",
  "increment_by",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  company."id",
  'purchase-requisition',
  COALESCE(legacy."prefix", 'PR-'),
  COALESCE(legacy."suffix", ''),
  COALESCE(legacy."pad_width", 4),
  COALESCE(legacy."next_value", 1),
  COALESCE(legacy."increment_by", 1),
  COALESCE(legacy."status", 'ACTIVE'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "companies" company
LEFT JOIN "number_sequences" legacy
  ON legacy."company_id" = company."id"
 AND legacy."sequence_key" = 'procurement.pr'
WHERE TRUE
ON CONFLICT ("company_id", "sequence_key") DO UPDATE
SET
  "next_value" = GREATEST("number_sequences"."next_value", EXCLUDED."next_value"),
  "updated_at" = CURRENT_TIMESTAMP;
