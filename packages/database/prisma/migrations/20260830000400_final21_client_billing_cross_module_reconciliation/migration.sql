-- Final-21 Pass B17.8: harden Client -> Project -> Claim -> Invoice ownership before cross-module reads depend on it.
-- Historical migrations stay unchanged; invalid legacy ownership blocks this forward migration instead of being guessed or rewritten.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "progress_claims" claim
      LEFT JOIN "projects" project ON project."id" = claim."project_id"
     WHERE project."id" IS NULL
        OR project."company_id" IS DISTINCT FROM claim."company_id"
        OR project."client_id" IS DISTINCT FROM claim."client_id"
  ) THEN
    RAISE EXCEPTION 'Client Billing migration blocked: Progress Claim Client/Project ownership is inconsistent.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "client_invoices" invoice
      LEFT JOIN "projects" project ON project."id" = invoice."project_id"
     WHERE project."id" IS NULL
        OR project."company_id" IS DISTINCT FROM invoice."company_id"
        OR project."client_id" IS DISTINCT FROM invoice."client_id"
  ) THEN
    RAISE EXCEPTION 'Client Billing migration blocked: Client Invoice Client/Project ownership is inconsistent.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "client_invoices" invoice
      LEFT JOIN "progress_claims" claim ON claim."id" = invoice."claim_id"
     WHERE invoice."claim_id" IS NOT NULL
       AND (
         claim."id" IS NULL
         OR claim."company_id" IS DISTINCT FROM invoice."company_id"
         OR claim."project_id" IS DISTINCT FROM invoice."project_id"
         OR claim."client_id" IS DISTINCT FROM invoice."client_id"
       )
  ) THEN
    RAISE EXCEPTION 'Client Billing migration blocked: Client Invoice Claim ownership is inconsistent.';
  END IF;
END;
$$;

-- Keep direct database writes inside the same Client -> Project ownership chain used by the service layer.
CREATE OR REPLACE FUNCTION "final21_validate_client_billing_owner_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  project_company_id UUID;
  project_client_id UUID;
  claim_company_id UUID;
  claim_project_id UUID;
  claim_client_id UUID;
BEGIN
  SELECT project."company_id", project."client_id"
    INTO project_company_id, project_client_id
    FROM "projects" project
   WHERE project."id" = NEW."project_id";

  IF project_company_id IS DISTINCT FROM NEW."company_id"
     OR project_client_id IS DISTINCT FROM NEW."client_id" THEN
    RAISE EXCEPTION 'Client Billing record must use the Project Client and Company.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'client_invoices' AND NEW."claim_id" IS NOT NULL THEN
    SELECT claim."company_id", claim."project_id", claim."client_id"
      INTO claim_company_id, claim_project_id, claim_client_id
      FROM "progress_claims" claim
     WHERE claim."id" = NEW."claim_id";

    IF claim_company_id IS DISTINCT FROM NEW."company_id"
       OR claim_project_id IS DISTINCT FROM NEW."project_id"
       OR claim_client_id IS DISTINCT FROM NEW."client_id" THEN
      RAISE EXCEPTION 'Client Invoice Claim must use the same Company, Project and Client.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "progress_claims_owner_scope_integrity" ON "progress_claims";
CREATE TRIGGER "progress_claims_owner_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "project_id", "client_id"
ON "progress_claims"
FOR EACH ROW
EXECUTE FUNCTION "final21_validate_client_billing_owner_scope"();

DROP TRIGGER IF EXISTS "client_invoices_claim_scope_integrity" ON "client_invoices";
CREATE TRIGGER "client_invoices_claim_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "project_id", "client_id", "claim_id"
ON "client_invoices"
FOR EACH ROW
EXECUTE FUNCTION "final21_validate_client_billing_owner_scope"();
