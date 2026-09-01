-- Pass 64 / Stage 3: Module 22 Approval Workflows core persistence.
-- Business resources stay generic resource_type/resource_id references.
-- No project_id relationship is introduced before Project Management/24B.

CREATE TABLE "approval_definitions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "condition_json" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "version_no" INTEGER NOT NULL,

    CONSTRAINT "approval_definitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_definitions_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_definitions_code_not_blank" CHECK (length(btrim("code")) > 0),
    CONSTRAINT "approval_definitions_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "approval_definitions_resource_type_not_blank" CHECK (length(btrim("resource_type")) > 0),
    CONSTRAINT "approval_definitions_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "approval_definitions_version_positive" CHECK ("version_no" > 0)
);

CREATE UNIQUE INDEX "approval_definitions_company_code_version_uq"
    ON "approval_definitions"("company_id", "code", "version_no");
CREATE INDEX "approval_definitions_company_status_idx"
    ON "approval_definitions"("company_id", "status");
CREATE INDEX "approval_definitions_company_resource_status_idx"
    ON "approval_definitions"("company_id", "resource_type", "status");

CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "step_no" INTEGER NOT NULL,
    "approver_type" VARCHAR(32) NOT NULL,
    "approver_ref" VARCHAR(150) NOT NULL,
    "min_approvals" INTEGER NOT NULL,
    "condition_json" JSONB,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_steps_definition_fkey"
        FOREIGN KEY ("definition_id") REFERENCES "approval_definitions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_steps_step_positive" CHECK ("step_no" > 0),
    CONSTRAINT "approval_steps_approver_type_not_blank" CHECK (length(btrim("approver_type")) > 0),
    CONSTRAINT "approval_steps_approver_ref_not_blank" CHECK (length(btrim("approver_ref")) > 0),
    CONSTRAINT "approval_steps_min_approvals_positive" CHECK ("min_approvals" > 0)
);

CREATE UNIQUE INDEX "approval_steps_definition_step_uq"
    ON "approval_steps"("definition_id", "step_no");
CREATE INDEX "approval_steps_approver_idx"
    ON "approval_steps"("approver_type", "approver_ref");

CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "definition_version" INTEGER NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "current_step_no" INTEGER NOT NULL,
    "payload_snapshot_json" JSONB NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_requests_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_definition_fkey"
        FOREIGN KEY ("definition_id") REFERENCES "approval_definitions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_requester_fkey"
        FOREIGN KEY ("requested_by") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_resource_type_not_blank" CHECK (length(btrim("resource_type")) > 0),
    CONSTRAINT "approval_requests_definition_version_positive" CHECK ("definition_version" > 0),
    CONSTRAINT "approval_requests_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "approval_requests_current_step_positive" CHECK ("current_step_no" > 0),
    CONSTRAINT "approval_requests_completed_after_requested" CHECK ("completed_at" IS NULL OR "completed_at" >= "requested_at")
);

CREATE INDEX "approval_requests_company_status_requested_idx"
    ON "approval_requests"("company_id", "status", "requested_at");
CREATE INDEX "approval_requests_company_resource_idx"
    ON "approval_requests"("company_id", "resource_type", "resource_id");
CREATE INDEX "approval_requests_definition_idx"
    ON "approval_requests"("definition_id");
CREATE INDEX "approval_requests_requester_idx"
    ON "approval_requests"("requested_by", "requested_at");

CREATE TABLE "approval_actions" (
    "id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "step_no" INTEGER NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "comment" VARCHAR(2000),
    "acted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_actions_request_fkey"
        FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_actions_actor_fkey"
        FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_actions_step_positive" CHECK ("step_no" > 0),
    CONSTRAINT "approval_actions_action_not_blank" CHECK (length(btrim("action")) > 0),
    CONSTRAINT "approval_actions_comment_not_blank" CHECK ("comment" IS NULL OR length(btrim("comment")) > 0)
);

CREATE INDEX "approval_actions_request_step_acted_idx"
    ON "approval_actions"("approval_request_id", "step_no", "acted_at");
CREATE INDEX "approval_actions_actor_acted_idx"
    ON "approval_actions"("actor_user_id", "acted_at");

CREATE TABLE "approval_delegations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "scope_json" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "approval_delegations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_delegations_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_delegations_from_user_fkey"
        FOREIGN KEY ("from_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_delegations_to_user_fkey"
        FOREIGN KEY ("to_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_delegations_users_different" CHECK ("from_user_id" <> "to_user_id"),
    CONSTRAINT "approval_delegations_date_order" CHECK ("from_date" <= "to_date"),
    CONSTRAINT "approval_delegations_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE INDEX "approval_delegations_company_status_idx"
    ON "approval_delegations"("company_id", "status");
CREATE INDEX "approval_delegations_from_active_idx"
    ON "approval_delegations"("from_user_id", "status", "from_date", "to_date");
CREATE INDEX "approval_delegations_to_active_idx"
    ON "approval_delegations"("to_user_id", "status", "from_date", "to_date");
