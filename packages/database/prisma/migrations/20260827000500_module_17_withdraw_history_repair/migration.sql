-- Pass 377 / Module 17: preserve one controlled Change Request withdrawal as immutable historical evidence.
ALTER TABLE "change_requests"
  ADD COLUMN "withdraw_reason" TEXT,
  ADD COLUMN "withdrawn_by" UUID,
  ADD COLUMN "withdrawn_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "change_requests_withdraw_state_check" CHECK (
    (
      "status" = 'WITHDRAWN'
      AND "withdraw_reason" IS NOT NULL
      AND length(btrim("withdraw_reason")) > 0
      AND "withdrawn_by" IS NOT NULL
      AND "withdrawn_at" IS NOT NULL
    )
    OR
    (
      "status" <> 'WITHDRAWN'
      AND "withdraw_reason" IS NULL
      AND "withdrawn_by" IS NULL
      AND "withdrawn_at" IS NULL
    )
  );

ALTER TABLE "change_requests"
  ADD CONSTRAINT "change_requests_withdrawer_company_fkey"
  FOREIGN KEY ("withdrawn_by", "company_id")
  REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "change_requests_withdrawer_withdrawn_idx"
  ON "change_requests"("withdrawn_by", "withdrawn_at");

CREATE OR REPLACE FUNCTION "protect_withdrawn_change_request"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" = 'WITHDRAWN' THEN
    RAISE EXCEPTION 'withdrawn change request history is immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'WITHDRAWN' THEN
    RAISE EXCEPTION 'withdrawn change request history is immutable';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "change_requests_protect_withdrawn_history"
BEFORE UPDATE OR DELETE ON "change_requests"
FOR EACH ROW EXECUTE FUNCTION "protect_withdrawn_change_request"();
