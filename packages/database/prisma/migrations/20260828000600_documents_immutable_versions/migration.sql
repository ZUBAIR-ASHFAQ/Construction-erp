-- Final 21-module refactor Documents hardening.
-- Document version metadata is evidence and must remain immutable after insert.
CREATE FUNCTION "prevent_document_version_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'document_versions are immutable and cannot be changed or deleted.'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "document_versions_immutable"
BEFORE UPDATE OR DELETE ON "document_versions"
FOR EACH ROW
EXECUTE FUNCTION "prevent_document_version_mutation"();
