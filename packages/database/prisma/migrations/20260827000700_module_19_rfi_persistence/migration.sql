CREATE TABLE "rfis" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "rfi_no" VARCHAR(100) NOT NULL,
  "subject" VARCHAR(300) NOT NULL,
  "question" TEXT NOT NULL,
  "discipline" VARCHAR(100) NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "raised_by" UUID NOT NULL,
  "assigned_to" UUID NOT NULL,
  "due_date" DATE NOT NULL,
  "closed_at" TIMESTAMPTZ(6),
  CONSTRAINT "rfis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rfi_responses" (
  "id" UUID NOT NULL,
  "rfi_id" UUID NOT NULL,
  "responder_user_id" UUID NOT NULL,
  "response" TEXT NOT NULL,
  "responded_at" TIMESTAMPTZ(6) NOT NULL,
  "response_type" VARCHAR(40) NOT NULL,
  "document_id" UUID,
  CONSTRAINT "rfi_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rfis_company_project_no_uq" ON "rfis"("company_id", "project_id", "rfi_no");
CREATE UNIQUE INDEX "rfis_id_company_project_uq" ON "rfis"("id", "company_id", "project_id");
CREATE INDEX "rfis_company_project_status_due_idx" ON "rfis"("company_id", "project_id", "status", "due_date");
CREATE INDEX "rfis_company_assignee_status_idx" ON "rfis"("company_id", "assigned_to", "status");

CREATE INDEX "rfi_responses_rfi_responded_at_idx" ON "rfi_responses"("rfi_id", "responded_at");
CREATE INDEX "rfi_responses_responder_time_idx" ON "rfi_responses"("responder_user_id", "responded_at");
CREATE INDEX "rfi_responses_document_idx" ON "rfi_responses"("document_id");

ALTER TABLE "rfis" ADD CONSTRAINT "rfis_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_project_company_fkey"
  FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_raised_by_company_fkey"
  FOREIGN KEY ("raised_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_assigned_to_company_fkey"
  FOREIGN KEY ("assigned_to", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "rfi_responses" ADD CONSTRAINT "rfi_responses_rfi_id_fkey"
  FOREIGN KEY ("rfi_id") REFERENCES "rfis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rfi_responses" ADD CONSTRAINT "rfi_responses_responder_user_id_fkey"
  FOREIGN KEY ("responder_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rfi_responses" ADD CONSTRAINT "rfi_responses_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RFI responses are historical evidence and must not be updated or deleted in place.
CREATE OR REPLACE FUNCTION prevent_rfi_response_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RFI responses are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rfi_responses_append_only_update
BEFORE UPDATE ON "rfi_responses"
FOR EACH ROW EXECUTE FUNCTION prevent_rfi_response_mutation();

CREATE TRIGGER rfi_responses_append_only_delete
BEFORE DELETE ON "rfi_responses"
FOR EACH ROW EXECUTE FUNCTION prevent_rfi_response_mutation();
