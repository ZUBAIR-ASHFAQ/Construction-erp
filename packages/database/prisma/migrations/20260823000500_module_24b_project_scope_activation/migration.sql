-- Pass 152 / Stage 8: activate Module 24B Project membership persistence and
-- validated PROJECT-scoped user-role assignment relationships after Projects exist.

CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_role" VARCHAR(120) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_members_project_role_not_blank" CHECK (length(btrim("project_role")) > 0),
    CONSTRAINT "project_members_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "project_members_date_range" CHECK ("to_date" IS NULL OR "to_date" >= "from_date")
);

CREATE UNIQUE INDEX "project_members_project_user_uq"
    ON "project_members"("company_id", "project_id", "user_id");
CREATE UNIQUE INDEX "project_members_id_company_uq"
    ON "project_members"("id", "company_id");
CREATE INDEX "project_members_company_status_idx"
    ON "project_members"("company_id", "status");
CREATE INDEX "project_members_project_status_idx"
    ON "project_members"("project_id", "status");
CREATE INDEX "project_members_user_status_idx"
    ON "project_members"("user_id", "status");

ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "project_members_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "project_members_user_company_fkey"
        FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Module 24A allowed only COMPANY scope while Projects did not exist. Stage 8
-- replaces those temporary constraints with the stable COMPANY/PROJECT shape.
ALTER TABLE "user_role_assignments"
    DROP CONSTRAINT "user_role_assignments_scope_company_only",
    DROP CONSTRAINT "user_role_assignments_scope_id_deferred";

DROP INDEX "user_role_assignments_company_user_role_uq";

ALTER TABLE "user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_scope_shape" CHECK (
        ("scope_type" = 'COMPANY' AND "scope_id" IS NULL)
        OR
        ("scope_type" = 'PROJECT' AND "scope_id" IS NOT NULL)
    ),
    ADD CONSTRAINT "user_role_assignments_project_scope_company_fkey"
        FOREIGN KEY ("scope_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

-- PostgreSQL NULL uniqueness is not suitable for COMPANY rows, so the two
-- supported scope shapes use explicit partial uniqueness constraints.
CREATE UNIQUE INDEX "user_role_assignments_company_scope_uq"
    ON "user_role_assignments"("company_id", "user_id", "role_id")
    WHERE "scope_type" = 'COMPANY';

CREATE UNIQUE INDEX "user_role_assignments_project_scope_uq"
    ON "user_role_assignments"("company_id", "user_id", "role_id", "scope_id")
    WHERE "scope_type" = 'PROJECT';

CREATE INDEX "user_role_assignments_scope_lookup_idx"
    ON "user_role_assignments"("company_id", "scope_type", "scope_id", "status");
