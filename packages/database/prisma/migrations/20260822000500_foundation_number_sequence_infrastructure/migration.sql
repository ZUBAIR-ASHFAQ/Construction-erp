-- Foundation Pass 13: reusable, company-scoped number sequence infrastructure.
-- Runtime allocation is transaction-bound and uses an atomic UPDATE ... RETURNING.
-- No Project Management FK or business-module table is introduced at Stage 0.

CREATE TABLE "number_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "sequence_key" VARCHAR(100) NOT NULL,
    "prefix" VARCHAR(40) NOT NULL DEFAULT '',
    "suffix" VARCHAR(40) NOT NULL DEFAULT '',
    "pad_width" INTEGER NOT NULL DEFAULT 6,
    "next_value" BIGINT NOT NULL DEFAULT 1,
    "increment_by" BIGINT NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "number_sequences_company_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "number_sequences_key_format"
      CHECK (
        length("sequence_key") BETWEEN 1 AND 100
        AND "sequence_key" ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$'
      ),
    CONSTRAINT "number_sequences_prefix_shape"
      CHECK (length("prefix") <= 40 AND "prefix" !~ '[[:cntrl:]]'),
    CONSTRAINT "number_sequences_suffix_shape"
      CHECK (length("suffix") <= 40 AND "suffix" !~ '[[:cntrl:]]'),
    CONSTRAINT "number_sequences_pad_width_range"
      CHECK ("pad_width" BETWEEN 1 AND 20),
    CONSTRAINT "number_sequences_next_value_positive"
      CHECK ("next_value" >= 1),
    CONSTRAINT "number_sequences_increment_positive"
      CHECK ("increment_by" >= 1),
    CONSTRAINT "number_sequences_status_allowed"
      CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE UNIQUE INDEX "number_sequences_company_key_uq"
  ON "number_sequences"("company_id", "sequence_key");

CREATE INDEX "number_sequences_company_status_idx"
  ON "number_sequences"("company_id", "status");
