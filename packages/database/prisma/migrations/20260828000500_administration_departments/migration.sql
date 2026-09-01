-- Final Module 2 company-owned Department master.
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "departments_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "departments_company_status_name_idx"
    ON "departments"("company_id", "status", "name");

-- Final Module 2 permission for Department administration.
INSERT INTO "permissions" ("id", "code", "name", "domain")
VALUES (gen_random_uuid(), 'admin.departments.manage', 'Manage Administration Departments', 'admin')
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "domain" = EXCLUDED."domain";

-- Preserve current administrators that already hold legacy user-management authority.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_permission."role_id", final_permission."id"
FROM "role_permissions" role_permission
JOIN "permissions" legacy_permission
  ON legacy_permission."id" = role_permission."permission_id"
JOIN "permissions" final_permission
  ON final_permission."code" = 'admin.departments.manage'
WHERE legacy_permission."code" = 'users.manage'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
