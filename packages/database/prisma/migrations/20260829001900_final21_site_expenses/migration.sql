-- Final-21 Pass B15.2: add only the Module 14 Site Expense persistence baseline.
-- Runtime schemas, repositories, services, routes, permissions and React UI are intentionally deferred.

CREATE TABLE "expense_categories" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "default_gl_account_id" UUID,
  "status" VARCHAR(32) NOT NULL,
  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_categories_code_not_blank" CHECK (length(btrim("code")) > 0),
  CONSTRAINT "expense_categories_name_not_blank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "expense_categories_status_not_blank" CHECK (length(btrim("status")) > 0),
  CONSTRAINT "expense_categories_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "expense_categories_default_gl_company_fkey"
    FOREIGN KEY ("default_gl_account_id", "company_id") REFERENCES "gl_accounts"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "expense_categories_company_code_uq"
  ON "expense_categories"("company_id", "code");
CREATE UNIQUE INDEX "expense_categories_id_company_uq"
  ON "expense_categories"("id", "company_id");
CREATE INDEX "expense_categories_company_status_name_idx"
  ON "expense_categories"("company_id", "status", "name");
CREATE INDEX "expense_categories_default_gl_account_idx"
  ON "expense_categories"("default_gl_account_id");

CREATE TABLE "site_expenses" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "stage_id" UUID,
  "expense_no" VARCHAR(100) NOT NULL,
  "expense_date" DATE NOT NULL,
  "category_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "payment_mode" VARCHAR(32) NOT NULL,
  "cash_bank_account_id" UUID,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "document_id" UUID,
  "created_by" UUID NOT NULL,
  "posted_at" TIMESTAMPTZ(6),
  CONSTRAINT "site_expenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "site_expenses_expense_no_not_blank" CHECK (length(btrim("expense_no")) > 0),
  CONSTRAINT "site_expenses_description_not_blank" CHECK (length(btrim("description")) > 0),
  CONSTRAINT "site_expenses_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "site_expenses_payment_mode_not_blank" CHECK (length(btrim("payment_mode")) > 0),
  CONSTRAINT "site_expenses_status_not_blank" CHECK (length(btrim("status")) > 0),
  CONSTRAINT "site_expenses_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "site_expenses_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "site_expenses_stage_project_fkey"
    FOREIGN KEY ("stage_id", "project_id") REFERENCES "project_stages"("id", "project_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "site_expenses_category_company_fkey"
    FOREIGN KEY ("category_id", "company_id") REFERENCES "expense_categories"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "site_expenses_cash_bank_company_fkey"
    FOREIGN KEY ("cash_bank_account_id", "company_id") REFERENCES "cash_bank_accounts"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "site_expenses_document_company_fkey"
    FOREIGN KEY ("document_id", "company_id") REFERENCES "documents"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "site_expenses_created_by_company_fkey"
    FOREIGN KEY ("created_by", "company_id") REFERENCES "users"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "site_expenses_company_expense_no_uq"
  ON "site_expenses"("company_id", "expense_no");
CREATE UNIQUE INDEX "site_expenses_id_company_uq"
  ON "site_expenses"("id", "company_id");
CREATE INDEX "site_expenses_company_project_status_date_idx"
  ON "site_expenses"("company_id", "project_id", "status", "expense_date");
CREATE INDEX "site_expenses_project_stage_date_idx"
  ON "site_expenses"("project_id", "stage_id", "expense_date");
CREATE INDEX "site_expenses_company_category_date_idx"
  ON "site_expenses"("company_id", "category_id", "expense_date");
CREATE INDEX "site_expenses_cash_bank_date_idx"
  ON "site_expenses"("cash_bank_account_id", "expense_date");
CREATE INDEX "site_expenses_document_idx"
  ON "site_expenses"("document_id");
CREATE INDEX "site_expenses_created_by_date_idx"
  ON "site_expenses"("created_by", "expense_date");
