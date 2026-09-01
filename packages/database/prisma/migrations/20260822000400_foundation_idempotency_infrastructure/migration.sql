-- Foundation Pass 12: persisted, company-scoped idempotency records.
-- No Users/RBAC or Project Management foreign keys are introduced at Stage 0.

CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "operation" VARCHAR(100) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    "request_id" VARCHAR(128) NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idempotency_records_company_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "idempotency_records_status_allowed"
      CHECK ("status" IN ('IN_PROGRESS', 'COMPLETED')),
    CONSTRAINT "idempotency_records_operation_format"
      CHECK (
        length(btrim("operation")) BETWEEN 3 AND 100
        AND "operation" ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'
      ),
    CONSTRAINT "idempotency_records_key_shape"
      CHECK (
        length(btrim("idempotency_key")) BETWEEN 1 AND 200
        AND "idempotency_key" !~ '[[:cntrl:]]'
      ),
    CONSTRAINT "idempotency_records_fingerprint_shape"
      CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "idempotency_records_response_status_shape"
      CHECK ("response_status" IS NULL OR "response_status" BETWEEN 200 AND 299),
    CONSTRAINT "idempotency_records_completion_shape"
      CHECK (
        ("status" = 'IN_PROGRESS'
          AND "response_status" IS NULL
          AND "response_body" IS NULL
          AND "completed_at" IS NULL)
        OR
        ("status" = 'COMPLETED'
          AND "response_status" IS NOT NULL
          AND "response_body" IS NOT NULL
          AND jsonb_typeof("response_body") = 'object'
          AND "response_body" ? 'body'
          AND "completed_at" IS NOT NULL)
      ),
    CONSTRAINT "idempotency_records_expiry_after_creation"
      CHECK ("expires_at" > "created_at")
);

CREATE UNIQUE INDEX "idempotency_records_company_operation_key_uq"
  ON "idempotency_records"("company_id", "operation", "idempotency_key");

CREATE INDEX "idempotency_records_status_expires_at_idx"
  ON "idempotency_records"("status", "expires_at");

CREATE INDEX "idempotency_records_company_created_at_idx"
  ON "idempotency_records"("company_id", "created_at");

CREATE INDEX "idempotency_records_request_id_idx"
  ON "idempotency_records"("request_id");

CREATE INDEX "idempotency_records_correlation_id_idx"
  ON "idempotency_records"("correlation_id");
