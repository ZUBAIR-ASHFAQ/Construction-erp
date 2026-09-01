-- Final-21 Repair R6: align Module 21 persistence with the merged requirements
-- and remove the unsupported document-folder business abstraction.
-- Historical migrations stay unchanged.

-- Folder-scope triggers reference columns/tables removed by this repair.
DROP TRIGGER IF EXISTS "document_folders_project_scope_consistency" ON "document_folders";
DROP TRIGGER IF EXISTS "documents_project_scope_consistency" ON "documents";
DROP TRIGGER IF EXISTS "document_upload_intents_project_scope_consistency" ON "document_upload_intents";
DROP FUNCTION IF EXISTS "module_18_check_folder_project_scope"();
DROP FUNCTION IF EXISTS "module_18_check_document_project_scope"();
DROP FUNCTION IF EXISTS "module_18_check_upload_intent_project_scope"();

-- Add the required document-level file metadata before removing legacy ownership.
ALTER TABLE "documents"
    ADD COLUMN "file_name" VARCHAR(500),
    ADD COLUMN "mime_type" VARCHAR(255),
    ADD COLUMN "size_bytes" BIGINT,
    ADD COLUMN "created_by" UUID;

-- Prefer the current immutable version for file metadata.
UPDATE "documents" AS document
SET
    "file_name" = version."original_name",
    "mime_type" = version."mime_type",
    "size_bytes" = version."size_bytes",
    "created_by" = document."owner_user_id"
FROM "document_versions" AS version
WHERE version."id" = document."current_version_id";

-- Keep older rows migratable even if they predate a current-version pointer.
UPDATE "documents"
SET
    "file_name" = COALESCE("file_name", "title"),
    "mime_type" = COALESCE("mime_type", 'application/octet-stream'),
    "size_bytes" = COALESCE("size_bytes", 1),
    "created_by" = COALESCE("created_by", "owner_user_id")
WHERE "file_name" IS NULL
   OR "mime_type" IS NULL
   OR "size_bytes" IS NULL
   OR "created_by" IS NULL;

ALTER TABLE "documents"
    ALTER COLUMN "file_name" SET NOT NULL,
    ALTER COLUMN "mime_type" SET NOT NULL,
    ALTER COLUMN "size_bytes" SET NOT NULL,
    ALTER COLUMN "created_by" SET NOT NULL,
    ADD CONSTRAINT "documents_file_name_not_blank" CHECK (length(btrim("file_name")) > 0),
    ADD CONSTRAINT "documents_mime_type_not_blank" CHECK (length(btrim("mime_type")) > 0),
    ADD CONSTRAINT "documents_size_positive" CHECK ("size_bytes" > 0);

-- Replace legacy owner naming with the final created_by ownership contract.
ALTER TABLE "documents"
    DROP CONSTRAINT IF EXISTS "documents_owner_company_fkey",
    DROP CONSTRAINT IF EXISTS "documents_owner_user_fkey";
DROP INDEX IF EXISTS "documents_owner_user_idx";

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_created_by_company_fkey"
    FOREIGN KEY ("created_by", "company_id")
    REFERENCES "users"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "documents_created_by_idx" ON "documents"("created_by");

-- Remove folder foreign keys/columns from documents and short-lived upload intents.
ALTER TABLE "documents"
    DROP CONSTRAINT IF EXISTS "documents_folder_company_fkey",
    DROP CONSTRAINT IF EXISTS "documents_folder_fkey";
ALTER TABLE "document_upload_intents"
    DROP CONSTRAINT IF EXISTS "document_upload_intents_folder_company_fkey",
    DROP CONSTRAINT IF EXISTS "document_upload_intents_folder_fkey";
DROP INDEX IF EXISTS "documents_folder_idx";
ALTER TABLE "documents" DROP COLUMN IF EXISTS "folder_id";
ALTER TABLE "document_upload_intents" DROP COLUMN IF EXISTS "folder_id";

-- Final Module 21 names version authorship as created_by/created_at.
ALTER TABLE "document_versions" RENAME COLUMN "uploaded_by" TO "created_by";
ALTER TABLE "document_versions" RENAME COLUMN "uploaded_at" TO "created_at";
ALTER INDEX IF EXISTS "document_versions_document_uploaded_at_idx"
    RENAME TO "document_versions_document_created_at_idx";
ALTER INDEX IF EXISTS "document_versions_uploader_uploaded_at_idx"
    RENAME TO "document_versions_creator_created_at_idx";

-- The folder table is not part of the Final-21 Module 21 database contract.
DROP TABLE IF EXISTS "document_folders";

-- Keep upload-intent Project scope consistent with an existing target document.
CREATE FUNCTION "final21_check_document_upload_project_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    document_project_id UUID;
BEGIN
    IF NEW."document_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "project_id"
      INTO document_project_id
      FROM "documents"
     WHERE "id" = NEW."document_id"
       AND "company_id" = NEW."company_id";

    IF FOUND AND document_project_id IS DISTINCT FROM NEW."project_id" THEN
        RAISE EXCEPTION 'document upload intent project scope must match document project scope'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "document_upload_intents_project_scope_consistency"
BEFORE INSERT OR UPDATE OF "document_id", "company_id", "project_id"
ON "document_upload_intents"
FOR EACH ROW
EXECUTE FUNCTION "final21_check_document_upload_project_scope"();

-- Legacy owner column is no longer part of the active Document contract.
ALTER TABLE "documents" DROP COLUMN IF EXISTS "owner_user_id";
