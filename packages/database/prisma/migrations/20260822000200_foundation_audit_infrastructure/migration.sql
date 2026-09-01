-- Foundation Pass 10: persistent audit infrastructure.
-- company_id is the only direct ownership FK available at this gate.
-- actor_user_id is stored as a UUID snapshot without a foreign key because
-- Module 24A has not been generated yet. Project scope is stored as JSON for
-- the same dependency-safe reason; no premature projects foreign key exists.
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "project_scope" JSONB NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(128) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "request_id" VARCHAR(128) NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_entity_type_not_blank" CHECK (length(btrim("entity_type")) > 0),
    CONSTRAINT "audit_logs_entity_id_not_blank" CHECK (length(btrim("entity_id")) > 0),
    CONSTRAINT "audit_logs_action_not_blank" CHECK (length(btrim("action")) > 0),
    CONSTRAINT "audit_logs_request_id_not_blank" CHECK (length(btrim("request_id")) > 0),
    CONSTRAINT "audit_logs_correlation_id_not_blank" CHECK (length(btrim("correlation_id")) > 0),
    CONSTRAINT "audit_logs_project_scope_object" CHECK (
        jsonb_typeof("project_scope") = 'object'
        AND "project_scope" ? 'kind'
        AND "project_scope"->>'kind' IN ('not-resolved', 'all', 'restricted')
    ),
    CONSTRAINT "audit_logs_restricted_scope_shape" CHECK (
        "project_scope"->>'kind' <> 'restricted'
        OR jsonb_typeof("project_scope"->'projectIds') = 'array'
    ),
    CONSTRAINT "audit_logs_before_value_object" CHECK (
        "before_value" IS NULL OR jsonb_typeof("before_value") = 'object'
    ),
    CONSTRAINT "audit_logs_after_value_object" CHECK (
        "after_value" IS NULL OR jsonb_typeof("after_value") = 'object'
    )
);

CREATE INDEX "audit_logs_company_created_at_idx"
    ON "audit_logs"("company_id", "created_at");
CREATE INDEX "audit_logs_entity_created_at_idx"
    ON "audit_logs"("entity_type", "entity_id", "created_at");
CREATE INDEX "audit_logs_actor_created_at_idx"
    ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_request_id_idx"
    ON "audit_logs"("request_id");
CREATE INDEX "audit_logs_correlation_id_idx"
    ON "audit_logs"("correlation_id");
