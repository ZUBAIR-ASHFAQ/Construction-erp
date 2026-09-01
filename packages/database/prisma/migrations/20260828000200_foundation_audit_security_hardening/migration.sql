-- Final 21-module refactor Foundation audit hardening.
-- Audit history is evidence and must never be changed or deleted after insert.
CREATE FUNCTION "prevent_audit_log_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only and cannot be changed or deleted.'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_log_mutation"();
