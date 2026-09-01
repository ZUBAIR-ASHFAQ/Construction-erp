-- Pass 191 / Stage 10: activate the deferred Module 4B Project/WBS/Cost Code relationships.
-- Existing tender-only BOQs remain valid; this migration never guesses historical mappings.

ALTER TABLE "boqs"
    ALTER COLUMN "tender_id" DROP NOT NULL,
    ADD COLUMN "project_id" UUID;

ALTER TABLE "boq_items"
    ADD COLUMN "wbs_node_id" UUID,
    ADD COLUMN "cost_code_id" UUID;

ALTER TABLE "boqs"
    ADD CONSTRAINT "boqs_scope_required"
        CHECK ("tender_id" IS NOT NULL OR "project_id" IS NOT NULL);

CREATE INDEX "boqs_company_project_created_idx"
    ON "boqs"("company_id", "project_id", "created_at");

CREATE INDEX "boq_items_wbs_node_idx"
    ON "boq_items"("wbs_node_id");

CREATE INDEX "boq_items_cost_code_idx"
    ON "boq_items"("cost_code_id");

ALTER TABLE "boqs"
    ADD CONSTRAINT "boqs_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "boq_items"
    ADD CONSTRAINT "boq_items_wbs_node_id_fkey"
        FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "boq_items_cost_code_id_fkey"
        FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- BOQ items do not own project_id or company_id. Resolve both through the
-- revision -> BOQ relationship and reject mappings outside that trusted scope.
CREATE FUNCTION "module_4b_validate_boq_item_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    boq_project_id UUID;
    boq_company_id UUID;
    wbs_project_id UUID;
    wbs_company_id UUID;
    cost_code_company_id UUID;
BEGIN
    SELECT boq."project_id", boq."company_id"
      INTO boq_project_id, boq_company_id
      FROM "boq_revisions" revision
      JOIN "boqs" boq ON boq."id" = revision."boq_id"
     WHERE revision."id" = NEW."boq_revision_id";

    IF NEW."wbs_node_id" IS NOT NULL OR NEW."cost_code_id" IS NOT NULL THEN
        IF boq_project_id IS NULL THEN
            RAISE EXCEPTION 'BOQ item mapping requires a Project-linked BOQ'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."wbs_node_id" IS NOT NULL THEN
        SELECT "project_id", "company_id"
          INTO wbs_project_id, wbs_company_id
          FROM "wbs_nodes"
         WHERE "id" = NEW."wbs_node_id";

        IF wbs_project_id IS DISTINCT FROM boq_project_id
           OR wbs_company_id IS DISTINCT FROM boq_company_id THEN
            RAISE EXCEPTION 'BOQ item WBS node must belong to the BOQ Project'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."cost_code_id" IS NOT NULL THEN
        SELECT "company_id"
          INTO cost_code_company_id
          FROM "cost_codes"
         WHERE "id" = NEW."cost_code_id";

        IF cost_code_company_id IS DISTINCT FROM boq_company_id THEN
            RAISE EXCEPTION 'BOQ item Cost Code must belong to the BOQ Company'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "boq_items_scope_integrity"
BEFORE INSERT OR UPDATE OF "boq_revision_id", "wbs_node_id", "cost_code_id"
ON "boq_items"
FOR EACH ROW
EXECUTE FUNCTION "module_4b_validate_boq_item_scope"();
