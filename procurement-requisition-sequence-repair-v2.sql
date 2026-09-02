-- Repair the missing Procurement material-requirement number sequence without changing migration history.
-- This statement is idempotent and preserves any existing sequence formatting while ensuring it is active
-- and starts after both legacy sequence state and already-created requisition numbers.

INSERT INTO "number_sequences" (
  "company_id",
  "sequence_key",
  "prefix",
  "suffix",
  "pad_width",
  "next_value",
  "increment_by",
  "status"
)
SELECT
  company."id",
  'purchase-requisition',
  COALESCE(legacy."prefix", 'PR-'),
  COALESCE(legacy."suffix", ''),
  COALESCE(legacy."pad_width", 4),
  GREATEST(
    COALESCE(legacy."next_value", 1),
    COALESCE(existing_requisition."next_value", 1)
  ),
  COALESCE(legacy."increment_by", 1),
  'ACTIVE'
FROM "companies" company
LEFT JOIN "number_sequences" legacy
  ON legacy."company_id" = company."id"
 AND legacy."sequence_key" = 'procurement.pr'
LEFT JOIN LATERAL (
  SELECT MAX((substring(requisition."pr_no" FROM '([0-9]+)$'))::BIGINT) + 1 AS "next_value"
  FROM "purchase_requisitions" requisition
  WHERE requisition."company_id" = company."id"
    AND requisition."pr_no" ~ '[0-9]+$'
) existing_requisition ON TRUE
ON CONFLICT ("company_id", "sequence_key") DO UPDATE
SET
  "next_value" = GREATEST("number_sequences"."next_value", EXCLUDED."next_value"),
  "status" = 'ACTIVE',
  "updated_at" = CURRENT_TIMESTAMP;
