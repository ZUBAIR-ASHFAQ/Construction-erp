-- Final-21 Pass B16.2: add only the Module 17 Supplier Payables persistence baseline.
-- Runtime schemas, repositories, services, routes, permissions, Finance posting and React UI are intentionally deferred.

-- Supporting composite uniqueness lets Supplier Invoice references prove Purchase Order/Goods Receipt
-- Company + Project + Vendor ownership without duplicating procurement data.
CREATE UNIQUE INDEX "purchase_orders_id_company_project_vendor_uq"
  ON "purchase_orders"("id", "company_id", "project_id", "vendor_id");
CREATE UNIQUE INDEX "goods_receipts_id_company_project_vendor_uq"
  ON "goods_receipts"("id", "company_id", "project_id", "vendor_id");

CREATE TABLE "supplier_invoices" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "invoice_no" VARCHAR(150) NOT NULL,
  "invoice_date" DATE NOT NULL,
  "due_date" DATE,
  "purchase_order_id" UUID,
  "goods_receipt_id" UUID,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "subtotal" DECIMAL(18,2) NOT NULL,
  "tax_amount" DECIMAL(18,2) NOT NULL,
  "total_amount" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_invoices_invoice_no_not_blank" CHECK (length(btrim("invoice_no")) > 0),
  CONSTRAINT "supplier_invoices_status_not_blank" CHECK (length(btrim("status")) > 0),
  CONSTRAINT "supplier_invoices_subtotal_non_negative" CHECK ("subtotal" >= 0),
  CONSTRAINT "supplier_invoices_tax_non_negative" CHECK ("tax_amount" >= 0),
  CONSTRAINT "supplier_invoices_total_positive" CHECK ("total_amount" > 0),
  CONSTRAINT "supplier_invoices_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_invoices_vendor_company_fkey"
    FOREIGN KEY ("vendor_id", "company_id") REFERENCES "vendors"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "supplier_invoices_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "supplier_invoices_purchase_order_scope_fkey"
    FOREIGN KEY ("purchase_order_id", "company_id", "project_id", "vendor_id")
    REFERENCES "purchase_orders"("id", "company_id", "project_id", "vendor_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "supplier_invoices_goods_receipt_scope_fkey"
    FOREIGN KEY ("goods_receipt_id", "company_id", "project_id", "vendor_id")
    REFERENCES "goods_receipts"("id", "company_id", "project_id", "vendor_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "supplier_invoices_company_vendor_invoice_no_uq"
  ON "supplier_invoices"("company_id", "vendor_id", "invoice_no");
CREATE UNIQUE INDEX "supplier_invoices_id_company_uq"
  ON "supplier_invoices"("id", "company_id");
CREATE INDEX "supplier_invoices_company_project_status_date_idx"
  ON "supplier_invoices"("company_id", "project_id", "status", "invoice_date");
CREATE INDEX "supplier_invoices_company_vendor_status_due_idx"
  ON "supplier_invoices"("company_id", "vendor_id", "status", "due_date");
CREATE INDEX "supplier_invoices_purchase_order_idx"
  ON "supplier_invoices"("purchase_order_id");
CREATE INDEX "supplier_invoices_goods_receipt_idx"
  ON "supplier_invoices"("goods_receipt_id");

CREATE TABLE "supplier_invoice_lines" (
  "id" UUID NOT NULL,
  "supplier_invoice_id" UUID NOT NULL,
  "stage_id" UUID,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "expense_or_inventory_account_id" UUID,
  CONSTRAINT "supplier_invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_invoice_lines_description_not_blank" CHECK (length(btrim("description")) > 0),
  CONSTRAINT "supplier_invoice_lines_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "supplier_invoice_lines_invoice_fkey"
    FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_invoice_lines_stage_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_invoice_lines_account_fkey"
    FOREIGN KEY ("expense_or_inventory_account_id") REFERENCES "gl_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "supplier_invoice_lines_invoice_stage_idx"
  ON "supplier_invoice_lines"("supplier_invoice_id", "stage_id");
CREATE INDEX "supplier_invoice_lines_account_idx"
  ON "supplier_invoice_lines"("expense_or_inventory_account_id");

CREATE TABLE "supplier_payments" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "project_id" UUID,
  "payment_no" VARCHAR(100) NOT NULL,
  "payment_date" DATE NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "cash_bank_account_id" UUID NOT NULL,
  "reference" VARCHAR(200),
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_payments_payment_no_not_blank" CHECK (length(btrim("payment_no")) > 0),
  CONSTRAINT "supplier_payments_status_not_blank" CHECK (length(btrim("status")) > 0),
  CONSTRAINT "supplier_payments_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "supplier_payments_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_payments_vendor_company_fkey"
    FOREIGN KEY ("vendor_id", "company_id") REFERENCES "vendors"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "supplier_payments_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "supplier_payments_cash_bank_company_fkey"
    FOREIGN KEY ("cash_bank_account_id", "company_id") REFERENCES "cash_bank_accounts"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "supplier_payments_company_payment_no_uq"
  ON "supplier_payments"("company_id", "payment_no");
CREATE UNIQUE INDEX "supplier_payments_id_company_uq"
  ON "supplier_payments"("id", "company_id");
CREATE INDEX "supplier_payments_company_vendor_status_date_idx"
  ON "supplier_payments"("company_id", "vendor_id", "status", "payment_date");
CREATE INDEX "supplier_payments_company_project_date_idx"
  ON "supplier_payments"("company_id", "project_id", "payment_date");
CREATE INDEX "supplier_payments_cash_bank_date_idx"
  ON "supplier_payments"("cash_bank_account_id", "payment_date");

CREATE TABLE "supplier_payment_allocations" (
  "id" UUID NOT NULL,
  "supplier_payment_id" UUID NOT NULL,
  "supplier_invoice_id" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "allocated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_payment_allocations_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "supplier_payment_allocations_payment_fkey"
    FOREIGN KEY ("supplier_payment_id") REFERENCES "supplier_payments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_payment_allocations_invoice_fkey"
    FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "supplier_payment_allocations_payment_at_idx"
  ON "supplier_payment_allocations"("supplier_payment_id", "allocated_at");
CREATE INDEX "supplier_payment_allocations_invoice_at_idx"
  ON "supplier_payment_allocations"("supplier_invoice_id", "allocated_at");
