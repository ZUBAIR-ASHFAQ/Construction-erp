-- Final-21 Pass B17.2: harden Client Billing line persistence without rewriting historical claims or invoices.
-- Existing non-null Stage/account references must already be valid. Invalid legacy rows fail closed for explicit remediation.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "progress_claim_lines" line
    JOIN "progress_claims" claim ON claim."id" = line."claim_id"
    LEFT JOIN "project_stages" stage ON stage."id" = line."stage_id"
    WHERE line."stage_id" IS NOT NULL
      AND (
        stage."id" IS NULL
        OR stage."project_id" IS DISTINCT FROM claim."project_id"
        OR stage."company_id" IS DISTINCT FROM claim."company_id"
      )
  ) THEN
    RAISE EXCEPTION 'Client Billing migration blocked: Progress Claim line Stage scope is invalid.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "client_invoice_lines" line
    JOIN "client_invoices" invoice ON invoice."id" = line."client_invoice_id"
    LEFT JOIN "project_stages" stage ON stage."id" = line."stage_id"
    WHERE line."stage_id" IS NOT NULL
      AND (
        stage."id" IS NULL
        OR stage."project_id" IS DISTINCT FROM invoice."project_id"
        OR stage."company_id" IS DISTINCT FROM invoice."company_id"
      )
  ) THEN
    RAISE EXCEPTION 'Client Billing migration blocked: Client Invoice line Stage scope is invalid.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "client_invoice_lines" line
    JOIN "client_invoices" invoice ON invoice."id" = line."client_invoice_id"
    LEFT JOIN "gl_accounts" account ON account."id" = line."revenue_account_id"
    WHERE line."revenue_account_id" IS NOT NULL
      AND (
        account."id" IS NULL
        OR account."company_id" IS DISTINCT FROM invoice."company_id"
      )
  ) THEN
    RAISE EXCEPTION 'Client Billing migration blocked: Client Invoice line revenue account scope is invalid.';
  END IF;
END
$$;

ALTER TABLE "progress_claim_lines"
  ADD CONSTRAINT "progress_claim_lines_stage_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_invoice_lines"
  ADD CONSTRAINT "client_invoice_lines_stage_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "client_invoice_lines_revenue_account_fkey"
    FOREIGN KEY ("revenue_account_id") REFERENCES "gl_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "progress_claim_lines_stage_idx"
  ON "progress_claim_lines"("stage_id");
CREATE INDEX "client_invoice_lines_stage_idx"
  ON "client_invoice_lines"("stage_id");
CREATE INDEX "client_invoice_lines_revenue_account_idx"
  ON "client_invoice_lines"("revenue_account_id");

-- Purpose: enforce cross-row Project/Company ownership without duplicating Project/Company columns on billing lines.
CREATE FUNCTION "final21_validate_client_billing_line_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_project_id UUID;
  parent_company_id UUID;
  stage_project_id UUID;
  stage_company_id UUID;
  account_company_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'progress_claim_lines' THEN
    SELECT claim."project_id", claim."company_id"
      INTO parent_project_id, parent_company_id
      FROM "progress_claims" claim
     WHERE claim."id" = NEW."claim_id";
  ELSE
    SELECT invoice."project_id", invoice."company_id"
      INTO parent_project_id, parent_company_id
      FROM "client_invoices" invoice
     WHERE invoice."id" = NEW."client_invoice_id";
  END IF;

  IF NEW."stage_id" IS NOT NULL THEN
    SELECT stage."project_id", stage."company_id"
      INTO stage_project_id, stage_company_id
      FROM "project_stages" stage
     WHERE stage."id" = NEW."stage_id";

    IF stage_project_id IS DISTINCT FROM parent_project_id
       OR stage_company_id IS DISTINCT FROM parent_company_id THEN
      RAISE EXCEPTION 'Client Billing Stage must belong to the same Project and Company.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'client_invoice_lines' AND NEW."revenue_account_id" IS NOT NULL THEN
    SELECT account."company_id"
      INTO account_company_id
      FROM "gl_accounts" account
     WHERE account."id" = NEW."revenue_account_id";

    IF account_company_id IS DISTINCT FROM parent_company_id THEN
      RAISE EXCEPTION 'Client Invoice revenue account must belong to the same Company.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "progress_claim_lines_scope_integrity"
BEFORE INSERT OR UPDATE OF "claim_id", "stage_id" ON "progress_claim_lines"
FOR EACH ROW
EXECUTE FUNCTION "final21_validate_client_billing_line_scope"();

CREATE TRIGGER "client_invoice_lines_scope_integrity"
BEFORE INSERT OR UPDATE OF "client_invoice_id", "stage_id", "revenue_account_id" ON "client_invoice_lines"
FOR EACH ROW
EXECUTE FUNCTION "final21_validate_client_billing_line_scope"();
