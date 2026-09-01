-- Final Module 21 Documents & Audit Log alignment.
-- Preserve existing history while adding exact Project/Stage audit dimensions and final resource naming.
ALTER TABLE "audit_logs"
    ADD COLUMN "project_id" UUID,
    ADD COLUMN "stage_id" UUID;

-- Backfill exact Project/Stage dimensions only when existing safe audit snapshots contain valid UUIDs.
UPDATE "audit_logs" audit
SET "project_id" = COALESCE(audit."after_value"->>'projectId', audit."before_value"->>'projectId')::uuid
WHERE COALESCE(audit."after_value"->>'projectId', audit."before_value"->>'projectId')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (
      SELECT 1
      FROM "projects" project
      WHERE project."id" = COALESCE(audit."after_value"->>'projectId', audit."before_value"->>'projectId')::uuid
        AND project."company_id" = audit."company_id"
  );

UPDATE "audit_logs"
SET "stage_id" = COALESCE("after_value"->>'stageId', "before_value"->>'stageId')::uuid
WHERE COALESCE("after_value"->>'stageId', "before_value"->>'stageId')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

ALTER TABLE "audit_logs"
    RENAME COLUMN "entity_type" TO "resource_type";
ALTER TABLE "audit_logs"
    RENAME COLUMN "entity_id" TO "resource_id";
ALTER TABLE "audit_logs"
    RENAME COLUMN "before_value" TO "before_json";
ALTER TABLE "audit_logs"
    RENAME COLUMN "after_value" TO "after_json";

DROP INDEX IF EXISTS "audit_logs_entity_created_at_idx";
CREATE INDEX "audit_logs_company_project_created_at_idx"
    ON "audit_logs"("company_id", "project_id", "created_at");
CREATE INDEX "audit_logs_company_stage_created_at_idx"
    ON "audit_logs"("company_id", "stage_id", "created_at");
CREATE INDEX "audit_logs_company_resource_created_at_idx"
    ON "audit_logs"("company_id", "resource_type", "resource_id", "created_at");

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Final document links use resource_type/resource_id directly and need no generic relation discriminator.
DROP INDEX IF EXISTS "document_links_document_resource_relation_uq";
ALTER TABLE "document_links"
    RENAME COLUMN "linked_resource_type" TO "resource_type";
ALTER TABLE "document_links"
    RENAME COLUMN "linked_resource_id" TO "resource_id";
ALTER TABLE "document_links"
    DROP COLUMN "relation_type";
CREATE UNIQUE INDEX "document_links_document_resource_uq"
    ON "document_links"("document_id", "resource_type", "resource_id");

-- Ensure the final Module 21 permission vocabulary exists.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'documents.read', 'Read Documents', 'documents'),
  (gen_random_uuid(), 'documents.upload', 'Upload Documents', 'documents'),
  (gen_random_uuid(), 'documents.link', 'Link Documents', 'documents'),
  (gen_random_uuid(), 'documents.version', 'Version Documents', 'documents'),
  (gen_random_uuid(), 'audit.read', 'Read Audit Log', 'audit'),
  (gen_random_uuid(), 'audit.export', 'Export Audit Log', 'audit')
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

-- Preserve legacy Project document readers under the final documents.read permission.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT existing."role_id", final_permission."id"
FROM "role_permissions" existing
JOIN "permissions" legacy_permission ON legacy_permission."id" = existing."permission_id"
JOIN "permissions" final_permission ON final_permission."code" = 'documents.read'
WHERE legacy_permission."code" = 'documents.project.read'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Existing Administration role managers receive the audit read/export capability on upgrade.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT existing."role_id", final_permission."id"
FROM "role_permissions" existing
JOIN "permissions" manager_permission ON manager_permission."id" = existing."permission_id"
JOIN "permissions" final_permission ON final_permission."code" IN ('audit.read', 'audit.export')
WHERE manager_permission."code" = 'admin.roles.manage'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
-- Remove obsolete pre-final permission rows after preserving their valid grants.
DELETE FROM "role_permissions"
WHERE "permission_id" IN (
    SELECT "id" FROM "permissions" WHERE "code" IN ('documents.project.read', 'documents.archive')
);
DELETE FROM "permissions" WHERE "code" IN ('documents.project.read', 'documents.archive');
