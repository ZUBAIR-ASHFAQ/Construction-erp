-- Pass 23 / Stage 1: Module 24A Users/RBAC Core persistence.
-- Creates company-scoped identity/authentication/RBAC tables without any
-- Project Management foreign key. Project membership remains deferred to 24B.

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(50),
    "name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "users_email_not_blank" CHECK (length(btrim("email")) > 0),
    CONSTRAINT "users_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "users_phone_not_blank" CHECK ("phone" IS NULL OR length(btrim("phone")) > 0),
    CONSTRAINT "users_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE UNIQUE INDEX "users_company_email_uq" ON "users"("company_id", "email");
CREATE INDEX "users_company_status_idx" ON "users"("company_id", "status");
CREATE INDEX "users_company_name_idx" ON "users"("company_id", "name");

CREATE TABLE "auth_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "password_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret_ref" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_credentials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_credentials_user_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "auth_credentials_password_hash_not_blank" CHECK (length(btrim("password_hash")) > 0),
    CONSTRAINT "auth_credentials_mfa_secret_ref_not_blank" CHECK ("mfa_secret_ref" IS NULL OR length(btrim("mfa_secret_ref")) > 0)
);

CREATE UNIQUE INDEX "auth_credentials_user_uq" ON "auth_credentials"("user_id");

CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "ip" VARCHAR(64) NOT NULL,
    "user_agent" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_sessions_user_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "auth_sessions_refresh_token_hash_not_blank" CHECK (length(btrim("refresh_token_hash")) > 0),
    CONSTRAINT "auth_sessions_ip_not_blank" CHECK (length(btrim("ip")) > 0),
    CONSTRAINT "auth_sessions_user_agent_not_blank" CHECK (length(btrim("user_agent")) > 0),
    CONSTRAINT "auth_sessions_revocation_not_before_creation" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
);

CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_uq" ON "auth_sessions"("refresh_token_hash");
CREATE INDEX "auth_sessions_user_expires_at_idx" ON "auth_sessions"("user_id", "expires_at");
CREATE INDEX "auth_sessions_user_revoked_at_idx" ON "auth_sessions"("user_id", "revoked_at");

CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "roles_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "roles_code_not_blank" CHECK (length(btrim("code")) > 0),
    CONSTRAINT "roles_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "roles_description_not_blank" CHECK ("description" IS NULL OR length(btrim("description")) > 0),
    CONSTRAINT "roles_status_not_blank" CHECK (length(btrim("status")) > 0)
);

-- PostgreSQL UNIQUE treats NULL values as distinct, so both indexes are needed:
-- one for company-owned roles and one for nullable-company global/system roles.
CREATE UNIQUE INDEX "roles_company_code_uq" ON "roles"("company_id", "code");
CREATE UNIQUE INDEX "roles_global_code_uq" ON "roles"("code") WHERE "company_id" IS NULL;
CREATE INDEX "roles_company_status_idx" ON "roles"("company_id", "status");

CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(150) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "domain" VARCHAR(100) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "permissions_code_not_blank" CHECK (length(btrim("code")) > 0),
    CONSTRAINT "permissions_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "permissions_domain_not_blank" CHECK (length(btrim("domain")) > 0)
);

CREATE UNIQUE INDEX "permissions_code_uq" ON "permissions"("code");
CREATE INDEX "permissions_domain_code_idx" ON "permissions"("domain", "code");

CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id"),
    CONSTRAINT "role_permissions_role_fkey"
        FOREIGN KEY ("role_id") REFERENCES "roles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_permissions_permission_fkey"
        FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "role_permissions_permission_idx" ON "role_permissions"("permission_id");

CREATE TABLE "user_role_assignments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL DEFAULT 'COMPANY',
    "scope_id" UUID,
    "status" VARCHAR(32) NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_role_assignments_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_role_assignments_user_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_role_assignments_role_fkey"
        FOREIGN KEY ("role_id") REFERENCES "roles"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_role_assignments_scope_company_only" CHECK ("scope_type" = 'COMPANY'),
    CONSTRAINT "user_role_assignments_scope_id_deferred" CHECK ("scope_id" IS NULL),
    CONSTRAINT "user_role_assignments_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "user_role_assignments_date_range" CHECK ("to_date" IS NULL OR "to_date" >= "from_date")
);

CREATE UNIQUE INDEX "user_role_assignments_company_user_role_uq"
    ON "user_role_assignments"("company_id", "user_id", "role_id");
CREATE INDEX "user_role_assignments_company_status_idx"
    ON "user_role_assignments"("company_id", "status");
CREATE INDEX "user_role_assignments_user_status_idx"
    ON "user_role_assignments"("user_id", "status");
CREATE INDEX "user_role_assignments_role_status_idx"
    ON "user_role_assignments"("role_id", "status");

-- Stage-0 actor/admin UUIDs were intentionally snapshots without a Users/RBAC
-- target. Add the real FK at the first gate where users exists. NOT VALID makes
-- the upgrade safe if historical Stage-0 diagnostic rows contain a pre-24A
-- actor UUID; PostgreSQL still enforces the FK for every new or updated row.
-- Where historical rows already resolve, validate immediately.
ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "outbox_events"
    ADD CONSTRAINT "outbox_events_actor_user_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "queue_jobs"
    ADD CONSTRAINT "queue_jobs_actor_user_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "initial_bootstrap_runs"
    ADD CONSTRAINT "initial_bootstrap_runs_administrator_user_fkey"
    FOREIGN KEY ("administrator_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "audit_logs" a
        WHERE a."actor_user_id" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = a."actor_user_id")
    ) THEN
        ALTER TABLE "audit_logs" VALIDATE CONSTRAINT "audit_logs_actor_user_fkey";
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "outbox_events" e
        WHERE e."actor_user_id" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = e."actor_user_id")
    ) THEN
        ALTER TABLE "outbox_events" VALIDATE CONSTRAINT "outbox_events_actor_user_fkey";
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "queue_jobs" q
        WHERE q."actor_user_id" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = q."actor_user_id")
    ) THEN
        ALTER TABLE "queue_jobs" VALIDATE CONSTRAINT "queue_jobs_actor_user_fkey";
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "initial_bootstrap_runs" b
        WHERE b."administrator_user_id" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = b."administrator_user_id")
    ) THEN
        ALTER TABLE "initial_bootstrap_runs" VALIDATE CONSTRAINT "initial_bootstrap_runs_administrator_user_fkey";
    END IF;
END $$;
