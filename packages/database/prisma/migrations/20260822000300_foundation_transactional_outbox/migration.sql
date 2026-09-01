-- Foundation Pass 11: durable transactional outbox.
-- Events are persisted in the same PostgreSQL transaction as the owning
-- business mutation/audit write. No Users/RBAC or Project FK is introduced at
-- this gate; actor/project scope are correlation snapshots only.
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "company_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "project_scope" JSONB NOT NULL,
    "event_type" VARCHAR(150) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(128) NOT NULL,
    "request_id" VARCHAR(128) NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" VARCHAR(128),
    "last_error_code" VARCHAR(100),
    "published_at" TIMESTAMPTZ(6),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "outbox_events_schema_version_positive" CHECK ("schema_version" > 0),
    CONSTRAINT "outbox_events_event_type_not_blank" CHECK (length(btrim("event_type")) > 0),
    CONSTRAINT "outbox_events_resource_type_not_blank" CHECK (length(btrim("resource_type")) > 0),
    CONSTRAINT "outbox_events_resource_id_not_blank" CHECK (length(btrim("resource_id")) > 0),
    CONSTRAINT "outbox_events_request_id_not_blank" CHECK (length(btrim("request_id")) > 0),
    CONSTRAINT "outbox_events_correlation_id_not_blank" CHECK (length(btrim("correlation_id")) > 0),
    CONSTRAINT "outbox_events_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
    CONSTRAINT "outbox_events_status_allowed" CHECK (
        "status" IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD_LETTER')
    ),
    CONSTRAINT "outbox_events_project_scope_object" CHECK (
        jsonb_typeof("project_scope") = 'object'
        AND "project_scope" ? 'kind'
        AND "project_scope"->>'kind' IN ('not-resolved', 'all', 'restricted')
    ),
    CONSTRAINT "outbox_events_restricted_scope_shape" CHECK (
        "project_scope"->>'kind' <> 'restricted'
        OR jsonb_typeof("project_scope"->'projectIds') = 'array'
    ),
    CONSTRAINT "outbox_events_payload_object" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "outbox_events_processing_lease_shape" CHECK (
        ("status" = 'PROCESSING' AND "locked_at" IS NOT NULL AND "locked_by" IS NOT NULL)
        OR ("status" <> 'PROCESSING' AND "locked_at" IS NULL AND "locked_by" IS NULL)
    ),
    CONSTRAINT "outbox_events_published_shape" CHECK (
        ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
        OR ("status" <> 'PUBLISHED' AND "published_at" IS NULL)
    )
);

-- Primary worker scan: due pending events and stale processing leases.
CREATE INDEX "outbox_events_delivery_idx"
    ON "outbox_events"("status", "available_at", "occurred_at");
CREATE INDEX "outbox_events_stale_lease_idx"
    ON "outbox_events"("status", "locked_at")
    WHERE "status" = 'PROCESSING';
CREATE INDEX "outbox_events_company_occurred_at_idx"
    ON "outbox_events"("company_id", "occurred_at");
CREATE INDEX "outbox_events_resource_idx"
    ON "outbox_events"("resource_type", "resource_id", "occurred_at");
CREATE INDEX "outbox_events_request_id_idx"
    ON "outbox_events"("request_id");
CREATE INDEX "outbox_events_correlation_id_idx"
    ON "outbox_events"("correlation_id");
