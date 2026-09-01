-- Pass 168 / Stage-8 audit repair: activate the deferred Module 18 Project
-- relationship now that Project Management and Project scope both exist.
-- Existing company-wide folders/documents/intents stay valid with project_id NULL.

ALTER TABLE "document_folders"
    ADD COLUMN "project_id" UUID;

ALTER TABLE "documents"
    ADD COLUMN "project_id" UUID;

-- Upload intents carry the trusted Project target across the signed-upload flow
-- so completion never needs to trust a Project id supplied a second time.
ALTER TABLE "document_upload_intents"
    ADD COLUMN "project_id" UUID;

CREATE INDEX "document_folders_company_project_status_idx"
    ON "document_folders"("company_id", "project_id", "status");

CREATE INDEX "documents_company_project_status_idx"
    ON "documents"("company_id", "project_id", "status");

CREATE INDEX "document_upload_intents_company_project_expires_at_idx"
    ON "document_upload_intents"("company_id", "project_id", "expires_at");

-- Project references must resolve inside the owning company.
ALTER TABLE "document_folders"
    ADD CONSTRAINT "document_folders_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id")
    REFERENCES "projects"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id")
    REFERENCES "projects"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "document_upload_intents"
    ADD CONSTRAINT "document_upload_intents_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id")
    REFERENCES "projects"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Keep a folder tree inside one Project scope. IS DISTINCT FROM treats two
-- NULL Project ids as equal, which preserves company-wide folder trees.
CREATE FUNCTION "module_18_check_folder_project_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_project_id UUID;
BEGIN
    IF NEW."parent_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "project_id"
      INTO parent_project_id
      FROM "document_folders"
     WHERE "id" = NEW."parent_id"
       AND "company_id" = NEW."company_id";

    IF FOUND AND parent_project_id IS DISTINCT FROM NEW."project_id" THEN
        RAISE EXCEPTION 'document folder project scope must match parent folder project scope'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM "document_folders"
         WHERE "parent_id" = NEW."id"
           AND "company_id" = NEW."company_id"
           AND "project_id" IS DISTINCT FROM NEW."project_id"
    ) THEN
        RAISE EXCEPTION 'document folder project scope must match child folder project scope'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM "documents"
         WHERE "folder_id" = NEW."id"
           AND "company_id" = NEW."company_id"
           AND "project_id" IS DISTINCT FROM NEW."project_id"
    ) THEN
        RAISE EXCEPTION 'document folder project scope must match contained document project scope'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM "document_upload_intents"
         WHERE "folder_id" = NEW."id"
           AND "company_id" = NEW."company_id"
           AND "project_id" IS DISTINCT FROM NEW."project_id"
    ) THEN
        RAISE EXCEPTION 'document folder project scope must match upload intent project scope'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "document_folders_project_scope_consistency"
BEFORE INSERT OR UPDATE OF "parent_id", "company_id", "project_id"
ON "document_folders"
FOR EACH ROW
EXECUTE FUNCTION "module_18_check_folder_project_scope"();

-- A document placed in a folder must use exactly the same nullable Project
-- scope as that folder.
CREATE FUNCTION "module_18_check_document_project_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    folder_project_id UUID;
BEGIN
    IF NEW."folder_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "project_id"
      INTO folder_project_id
      FROM "document_folders"
     WHERE "id" = NEW."folder_id"
       AND "company_id" = NEW."company_id";

    IF FOUND AND folder_project_id IS DISTINCT FROM NEW."project_id" THEN
        RAISE EXCEPTION 'document project scope must match folder project scope'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM "document_upload_intents"
         WHERE "document_id" = NEW."id"
           AND "company_id" = NEW."company_id"
           AND "project_id" IS DISTINCT FROM NEW."project_id"
    ) THEN
        RAISE EXCEPTION 'document project scope must match upload intent project scope'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "documents_project_scope_consistency"
BEFORE INSERT OR UPDATE OF "folder_id", "company_id", "project_id"
ON "documents"
FOR EACH ROW
EXECUTE FUNCTION "module_18_check_document_project_scope"();

-- Upload-intent Project scope must agree with both its folder and an existing
-- target document. This keeps the signed upload command's scope server-owned.
CREATE FUNCTION "module_18_check_upload_intent_project_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    folder_project_id UUID;
    document_project_id UUID;
BEGIN
    IF NEW."folder_id" IS NOT NULL THEN
        SELECT "project_id"
          INTO folder_project_id
          FROM "document_folders"
         WHERE "id" = NEW."folder_id"
           AND "company_id" = NEW."company_id";

        IF FOUND AND folder_project_id IS DISTINCT FROM NEW."project_id" THEN
            RAISE EXCEPTION 'document upload intent project scope must match folder project scope'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."document_id" IS NOT NULL THEN
        SELECT "project_id"
          INTO document_project_id
          FROM "documents"
         WHERE "id" = NEW."document_id"
           AND "company_id" = NEW."company_id";

        IF FOUND AND document_project_id IS DISTINCT FROM NEW."project_id" THEN
            RAISE EXCEPTION 'document upload intent project scope must match document project scope'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "document_upload_intents_project_scope_consistency"
BEFORE INSERT OR UPDATE OF "folder_id", "document_id", "company_id", "project_id"
ON "document_upload_intents"
FOR EACH ROW
EXECUTE FUNCTION "module_18_check_upload_intent_project_scope"();
