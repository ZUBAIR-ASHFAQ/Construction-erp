-- Final Module 21 document-link alignment.
-- Existing generic links are preserved while new links gain company, version, project and creator ownership.
ALTER TABLE "document_links"
    ADD COLUMN "company_id" UUID,
    ADD COLUMN "version_id" UUID,
    ADD COLUMN "project_id" UUID,
    ADD COLUMN "stage_id" UUID,
    ADD COLUMN "created_by" UUID;

-- Backfill trusted ownership from the already company-scoped Document row.
UPDATE "document_links" link
SET "company_id" = document."company_id",
    "version_id" = document."current_version_id",
    "project_id" = document."project_id",
    "created_by" = document."owner_user_id"
FROM "documents" document
WHERE document."id" = link."document_id";

ALTER TABLE "document_links"
    ALTER COLUMN "company_id" SET NOT NULL,
    ALTER COLUMN "created_by" SET NOT NULL;

-- Replace the old document-only FK with company-aware ownership and immutable-version integrity.
ALTER TABLE "document_links"
    DROP CONSTRAINT "document_links_document_fkey",
    ADD CONSTRAINT "document_links_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "document_links_document_company_fkey"
        FOREIGN KEY ("document_id", "company_id") REFERENCES "documents"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "document_links_version_document_fkey"
        FOREIGN KEY ("document_id", "version_id") REFERENCES "document_versions"("document_id", "id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "document_links_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "document_links_creator_company_fkey"
        FOREIGN KEY ("created_by", "company_id") REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "document_links_company_document_idx"
    ON "document_links"("company_id", "document_id");
CREATE INDEX "document_links_company_project_idx"
    ON "document_links"("company_id", "project_id");

-- Final Module 21 permission for controlled resource linking and unlinking.
INSERT INTO "permissions" ("id", "code", "name", "domain")
VALUES (gen_random_uuid(), 'documents.link', 'Link Documents', 'documents')
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "domain" = EXCLUDED."domain";

-- Preserve current document editors that already have upload authority.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_permission."role_id", final_permission."id"
FROM "role_permissions" role_permission
JOIN "permissions" legacy_permission
  ON legacy_permission."id" = role_permission."permission_id"
JOIN "permissions" final_permission
  ON final_permission."code" = 'documents.link'
WHERE legacy_permission."code" = 'documents.upload'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
