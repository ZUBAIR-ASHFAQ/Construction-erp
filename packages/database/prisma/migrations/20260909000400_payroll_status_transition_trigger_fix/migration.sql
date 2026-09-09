-- Preserve immutable finalized Payroll while allowing DRAFT/CALCULATED lifecycle transitions.
CREATE OR REPLACE FUNCTION "final21_prevent_finalized_payroll_run_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" = 'FINALIZED' THEN
    RAISE EXCEPTION 'Finalized Payroll is immutable; use an adjustment or reversal run' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
