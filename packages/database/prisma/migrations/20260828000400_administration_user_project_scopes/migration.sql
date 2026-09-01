-- Final Module 2 keeps user Project access separate from Project membership and role assignment.
CREATE TABLE "user_project_scopes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "role_code" VARCHAR(100),
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "user_project_scopes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_project_scopes_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_project_scopes_user_company_fkey"
        FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "user_project_scopes_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "user_project_scopes_company_user_project_uq"
    ON "user_project_scopes"("company_id", "user_id", "project_id");
CREATE INDEX "user_project_scopes_company_user_status_idx"
    ON "user_project_scopes"("company_id", "user_id", "status");
CREATE INDEX "user_project_scopes_company_project_status_idx"
    ON "user_project_scopes"("company_id", "project_id", "status");

-- Preserve currently active Project access while separating it from legacy Project membership.
INSERT INTO "user_project_scopes" (
    "id",
    "company_id",
    "user_id",
    "project_id",
    "role_code",
    "status"
)
SELECT
    gen_random_uuid(),
    member."company_id",
    member."user_id",
    member."project_id",
    NULL,
    'ACTIVE'
FROM "project_members" member
WHERE member."status" = 'ACTIVE'
  AND member."from_date" <= CURRENT_DATE
  AND (member."to_date" IS NULL OR member."to_date" >= CURRENT_DATE)
ON CONFLICT ("company_id", "user_id", "project_id") DO NOTHING;

-- Add the final permission used only for explicit Project-scope administration.
INSERT INTO "permissions" ("id", "code", "name", "domain")
VALUES (gen_random_uuid(), 'admin.project_scopes.manage', 'Manage Administration Project Scopes', 'admin')
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "domain" = EXCLUDED."domain";

-- Preserve current administrators that already hold the legacy users.manage permission.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_permission."role_id", final_permission."id"
FROM "role_permissions" role_permission
JOIN "permissions" legacy_permission
  ON legacy_permission."id" = role_permission."permission_id"
JOIN "permissions" final_permission
  ON final_permission."code" = 'admin.project_scopes.manage'
WHERE legacy_permission."code" = 'users.manage'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
