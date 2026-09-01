-- Final-21 B1: align Administration persistence with the final Module 2 contract.
-- Historical migrations remain unchanged. This forward migration moves password hashes
-- onto users, makes roles company-owned, retires legacy Administration permission aliases,
-- and enforces company-unique Department names.

-- The final users table owns the password hash. Invitation-only users may remain NULL
-- until they accept an invitation and set their first password.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMPTZ(6);

UPDATE "users" AS u
SET
  "password_hash" = c."password_hash",
  "password_changed_at" = c."password_changed_at"
FROM "auth_credentials" AS c
WHERE c."user_id" = u."id"
  AND u."password_hash" IS NULL;

DROP TABLE IF EXISTS "auth_credentials" CASCADE;

-- Final Module 2 roles are company-owned. Reconcile any historical global role by
-- creating one company copy, preserving its permissions, and redirecting assignments.
INSERT INTO "roles" (
  "id", "company_id", "code", "name", "description", "is_system", "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  c."id",
  r."code",
  r."name",
  r."description",
  r."is_system",
  r."status",
  r."created_at",
  r."updated_at"
FROM "roles" AS r
CROSS JOIN "companies" AS c
WHERE r."company_id" IS NULL
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT company_role."id", rp."permission_id"
FROM "roles" AS global_role
JOIN "role_permissions" AS rp ON rp."role_id" = global_role."id"
JOIN "roles" AS company_role
  ON company_role."code" = global_role."code"
 AND company_role."company_id" IS NOT NULL
WHERE global_role."company_id" IS NULL
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

UPDATE "user_role_assignments" AS ura
SET "role_id" = company_role."id"
FROM "roles" AS global_role, "roles" AS company_role
WHERE ura."role_id" = global_role."id"
  AND global_role."company_id" IS NULL
  AND company_role."code" = global_role."code"
  AND company_role."company_id" = ura."company_id";

DELETE FROM "roles" WHERE "company_id" IS NULL;
ALTER TABLE "roles" ALTER COLUMN "company_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "roles_id_company_uq"
  ON "roles"("id", "company_id");

-- Preserve any historical PROJECT-scoped role rows as explicit final Project scopes
-- before retiring the old mixed-scope assignment table.
INSERT INTO "user_project_scopes" (
  "id", "company_id", "user_id", "project_id", "role_code", "status"
)
SELECT
  gen_random_uuid(),
  ura."company_id",
  ura."user_id",
  ura."scope_id",
  r."code",
  ura."status"
FROM "user_role_assignments" AS ura
JOIN "users" AS u
  ON u."id" = ura."user_id"
 AND u."company_id" = ura."company_id"
JOIN "projects" AS p
  ON p."id" = ura."scope_id"
 AND p."company_id" = ura."company_id"
JOIN "roles" AS r
  ON r."id" = ura."role_id"
 AND r."company_id" = ura."company_id"
WHERE ura."scope_type" = 'PROJECT'
  AND ura."scope_id" IS NOT NULL
ON CONFLICT ("company_id", "user_id", "project_id") DO NOTHING;

-- Final Module 2 uses a simple company-owned user_roles table. Role assignment
-- no longer carries Project scope or effective-date fields.
CREATE TABLE "user_roles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_roles_company_fk" FOREIGN KEY ("company_id")
    REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "user_roles_user_company_fk" FOREIGN KEY ("user_id", "company_id")
    REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "user_roles_role_company_fk" FOREIGN KEY ("role_id", "company_id")
    REFERENCES "roles"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

INSERT INTO "user_roles" ("company_id", "user_id", "role_id", "status")
SELECT
  ura."company_id",
  ura."user_id",
  ura."role_id",
  CASE
    WHEN BOOL_OR(ura."status" = 'ACTIVE') THEN 'ACTIVE'
    ELSE MAX(ura."status")
  END
FROM "user_role_assignments" AS ura
JOIN "users" AS u
  ON u."id" = ura."user_id"
 AND u."company_id" = ura."company_id"
JOIN "roles" AS r
  ON r."id" = ura."role_id"
 AND r."company_id" = ura."company_id"
WHERE ura."scope_type" = 'COMPANY'
  AND ura."scope_id" IS NULL
GROUP BY ura."company_id", ura."user_id", ura."role_id";

CREATE UNIQUE INDEX "user_roles_company_user_role_uq"
  ON "user_roles"("company_id", "user_id", "role_id");
CREATE INDEX "user_roles_company_user_status_idx"
  ON "user_roles"("company_id", "user_id", "status");
CREATE INDEX "user_roles_company_role_status_idx"
  ON "user_roles"("company_id", "role_id", "status");

DROP TABLE "user_role_assignments";

-- Permission aliases were transitional only. The earlier Administration migration already
-- copied grants to the final admin.* codes, so these historical aliases can now be removed.
DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "id" FROM "permissions"
  WHERE "code" IN (
    'users.read', 'users.create', 'users.update', 'users.manage',
    'roles.read', 'roles.manage', 'sessions.manage'
  )
);

DELETE FROM "permissions"
WHERE "code" IN (
  'users.read', 'users.create', 'users.update', 'users.manage',
  'roles.read', 'roles.manage', 'sessions.manage'
);

-- Department names are company-unique in final Administration. Historical exact-name
-- duplicates are collapsed before the unique constraint because no final Module 2
-- business table owns a foreign key to Department yet.
DELETE FROM "departments" AS duplicate
USING "departments" AS keep
WHERE duplicate."company_id" = keep."company_id"
  AND duplicate."name" = keep."name"
  AND duplicate."id" > keep."id";

CREATE UNIQUE INDEX IF NOT EXISTS "departments_company_name_uq"
  ON "departments"("company_id", "name");
