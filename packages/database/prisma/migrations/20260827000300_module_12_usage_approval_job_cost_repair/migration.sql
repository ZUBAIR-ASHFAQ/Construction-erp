-- Pass 371 / Module 12 repair: approved Equipment usage before exactly-once Module-7 actual cost posting.
ALTER TABLE "equipment_usage"
  ADD COLUMN "approval_status" VARCHAR(32) NOT NULL DEFAULT 'RECORDED',
  ADD COLUMN "posted_at" TIMESTAMPTZ(6);

CREATE INDEX "equipment_usage_project_approval_status_date_idx"
  ON "equipment_usage" ("project_id", "approval_status", "usage_date");

-- Posted usage is historical evidence. Reversal/adjustment support is intentionally deferred to a later reviewed repair.
CREATE OR REPLACE FUNCTION prevent_posted_equipment_usage_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.approval_status = 'POSTED' THEN
    RAISE EXCEPTION 'posted equipment usage is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equipment_usage_posted_immutable_update
BEFORE UPDATE ON "equipment_usage"
FOR EACH ROW EXECUTE FUNCTION prevent_posted_equipment_usage_mutation();

CREATE TRIGGER equipment_usage_posted_immutable_delete
BEFORE DELETE ON "equipment_usage"
FOR EACH ROW EXECUTE FUNCTION prevent_posted_equipment_usage_mutation();
