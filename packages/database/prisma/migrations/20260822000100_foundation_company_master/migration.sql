-- Foundation Pass 04: canonical company master.
-- Keep status intentionally open-ended here; business status values are not defined by the source specification.
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "time_zone" VARCHAR(100) NOT NULL,
    "locale" VARCHAR(35) NOT NULL,
    "fiscal_settings" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "companies_legal_name_not_blank" CHECK (length(btrim("legal_name")) > 0),
    CONSTRAINT "companies_display_name_not_blank" CHECK (length(btrim("display_name")) > 0),
    CONSTRAINT "companies_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "companies_base_currency_iso_shape" CHECK ("base_currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "companies_time_zone_not_blank" CHECK (length(btrim("time_zone")) > 0),
    CONSTRAINT "companies_locale_not_blank" CHECK (length(btrim("locale")) > 0),
    CONSTRAINT "companies_fiscal_settings_object" CHECK (jsonb_typeof("fiscal_settings") = 'object')
);

CREATE INDEX "companies_status_idx" ON "companies"("status");
