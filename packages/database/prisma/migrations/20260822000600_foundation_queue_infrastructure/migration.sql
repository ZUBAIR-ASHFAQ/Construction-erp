-- Foundation Pass 15: durable background queue infrastructure.
-- PostgreSQL is used as the queue persistence provider so enqueue may share the
-- owning service transaction. Worker execution remains secondary/retryable and
-- core business correctness must not depend on a worker.
CREATE TABLE "queue_jobs" (
    "id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "company_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "project_scope" JSONB NOT NULL,
    "queue_name" VARCHAR(100) NOT NULL,
    "job_type" VARCHAR(150) NOT NULL,
    "request_id" VARCHAR(128) NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" VARCHAR(128),
    "last_error_code" VARCHAR(100),
    "completed_at" TIMESTAMPTZ(6),
    "dead_lettered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "queue_jobs_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "queue_jobs_schema_version_positive" CHECK ("schema_version" > 0),
    CONSTRAINT "queue_jobs_queue_name_shape" CHECK (
        "queue_name" ~ '^[a-z][a-z0-9-]{0,99}$'
    ),
    CONSTRAINT "queue_jobs_job_type_not_blank" CHECK (length(btrim("job_type")) > 0),
    CONSTRAINT "queue_jobs_request_id_not_blank" CHECK (length(btrim("request_id")) > 0),
    CONSTRAINT "queue_jobs_correlation_id_not_blank" CHECK (length(btrim("correlation_id")) > 0),
    CONSTRAINT "queue_jobs_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
    CONSTRAINT "queue_jobs_max_attempts_range" CHECK ("max_attempts" BETWEEN 1 AND 100),
    CONSTRAINT "queue_jobs_status_allowed" CHECK (
        "status" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'DEAD_LETTER')
    ),
    CONSTRAINT "queue_jobs_project_scope_object" CHECK (
        jsonb_typeof("project_scope") = 'object'
        AND "project_scope" ? 'kind'
        AND "project_scope"->>'kind' IN ('not-resolved', 'all', 'restricted')
    ),
    CONSTRAINT "queue_jobs_restricted_scope_shape" CHECK (
        "project_scope"->>'kind' <> 'restricted'
        OR jsonb_typeof("project_scope"->'projectIds') = 'array'
    ),
    CONSTRAINT "queue_jobs_payload_object" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "queue_jobs_processing_lease_shape" CHECK (
        ("status" = 'PROCESSING' AND "locked_at" IS NOT NULL AND "locked_by" IS NOT NULL)
        OR ("status" <> 'PROCESSING' AND "locked_at" IS NULL AND "locked_by" IS NULL)
    ),
    CONSTRAINT "queue_jobs_completed_shape" CHECK (
        ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "dead_lettered_at" IS NULL)
        OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
    ),
    CONSTRAINT "queue_jobs_dead_letter_shape" CHECK (
        ("status" = 'DEAD_LETTER' AND "dead_lettered_at" IS NOT NULL AND "completed_at" IS NULL)
        OR ("status" <> 'DEAD_LETTER' AND "dead_lettered_at" IS NULL)
    )
);

CREATE INDEX "queue_jobs_claim_idx"
    ON "queue_jobs"("queue_name", "status", "available_at", "created_at");
CREATE INDEX "queue_jobs_lease_idx"
    ON "queue_jobs"("status", "locked_at")
    WHERE "status" = 'PROCESSING';
CREATE INDEX "queue_jobs_company_created_at_idx"
    ON "queue_jobs"("company_id", "created_at");
CREATE INDEX "queue_jobs_request_id_idx" ON "queue_jobs"("request_id");
CREATE INDEX "queue_jobs_correlation_id_idx" ON "queue_jobs"("correlation_id");
