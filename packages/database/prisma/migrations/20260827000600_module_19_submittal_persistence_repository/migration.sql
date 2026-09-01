CREATE TABLE "submittals" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "submittal_no" VARCHAR(100) NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "submittal_type" VARCHAR(100) NOT NULL,
  "spec_reference" VARCHAR(200),
  "status" VARCHAR(32) NOT NULL,
  "responsible_user_id" UUID NOT NULL,
  "due_date" DATE NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "submittals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "submittal_revisions" (
  "id" UUID NOT NULL,
  "submittal_id" UUID NOT NULL,
  "revision_no" INTEGER NOT NULL,
  "submitted_at" TIMESTAMPTZ(6),
  "submitted_by" UUID,
  "status" VARCHAR(32) NOT NULL,
  "document_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "submittal_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "submittal_reviews" (
  "id" UUID NOT NULL,
  "submittal_revision_id" UUID NOT NULL,
  "reviewer_user_id" UUID NOT NULL,
  "decision" VARCHAR(40) NOT NULL,
  "comments" TEXT NOT NULL,
  "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "submittal_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "submittals_company_project_no_uq" ON "submittals"("company_id", "project_id", "submittal_no");
CREATE UNIQUE INDEX "submittals_id_company_project_uq" ON "submittals"("id", "company_id", "project_id");
CREATE INDEX "submittals_company_project_status_due_idx" ON "submittals"("company_id", "project_id", "status", "due_date");
CREATE INDEX "submittals_company_responsible_status_idx" ON "submittals"("company_id", "responsible_user_id", "status");

CREATE UNIQUE INDEX "submittal_revisions_submittal_revision_uq" ON "submittal_revisions"("submittal_id", "revision_no");
CREATE UNIQUE INDEX "submittal_revisions_submittal_id_id_uq" ON "submittal_revisions"("submittal_id", "id");
CREATE INDEX "submittal_revisions_submittal_status_revision_idx" ON "submittal_revisions"("submittal_id", "status", "revision_no");
CREATE INDEX "submittal_revisions_document_idx" ON "submittal_revisions"("document_id");
CREATE INDEX "submittal_revisions_submitter_time_idx" ON "submittal_revisions"("submitted_by", "submitted_at");

CREATE INDEX "submittal_reviews_revision_reviewed_at_idx" ON "submittal_reviews"("submittal_revision_id", "reviewed_at");
CREATE INDEX "submittal_reviews_reviewer_reviewed_at_idx" ON "submittal_reviews"("reviewer_user_id", "reviewed_at");

ALTER TABLE "submittals" ADD CONSTRAINT "submittals_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submittals" ADD CONSTRAINT "submittals_project_company_fkey"
  FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "submittals" ADD CONSTRAINT "submittals_responsible_user_company_fkey"
  FOREIGN KEY ("responsible_user_id", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "submittal_revisions" ADD CONSTRAINT "submittal_revisions_submittal_id_fkey"
  FOREIGN KEY ("submittal_id") REFERENCES "submittals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submittal_revisions" ADD CONSTRAINT "submittal_revisions_submitted_by_fkey"
  FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submittal_revisions" ADD CONSTRAINT "submittal_revisions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "submittal_reviews" ADD CONSTRAINT "submittal_reviews_revision_id_fkey"
  FOREIGN KEY ("submittal_revision_id") REFERENCES "submittal_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submittal_reviews" ADD CONSTRAINT "submittal_reviews_reviewer_user_id_fkey"
  FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Review rows are historical evidence and must not be updated or deleted in place.
CREATE OR REPLACE FUNCTION prevent_submittal_review_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'submittal reviews are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER submittal_reviews_append_only_update
BEFORE UPDATE ON "submittal_reviews"
FOR EACH ROW EXECUTE FUNCTION prevent_submittal_review_mutation();

CREATE TRIGGER submittal_reviews_append_only_delete
BEFORE DELETE ON "submittal_reviews"
FOR EACH ROW EXECUTE FUNCTION prevent_submittal_review_mutation();
