-- Pass 177 / Stage 9: prepare Module 6 WBS and cost-classification persistence.
-- Runtime/API activation remains gated by the genuine Stage-8 live handoff.
-- The source does not enumerate public status/category values, so persistence
-- only enforces nonblank values and does not invent enum vocabulary.

CREATE TABLE "wbs_nodes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "level" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "wbs_nodes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wbs_nodes_code_not_blank" CHECK (length(btrim("code")) > 0),
    CONSTRAINT "wbs_nodes_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "wbs_nodes_level_nonnegative" CHECK ("level" >= 0),
    CONSTRAINT "wbs_nodes_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "wbs_nodes_sort_order_nonnegative" CHECK ("sort_order" >= 0),
    CONSTRAINT "wbs_nodes_not_own_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);

CREATE TABLE "cost_codes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "cost_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cost_codes_code_not_blank" CHECK (length(btrim("code")) > 0),
    CONSTRAINT "cost_codes_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "cost_codes_category_not_blank" CHECK (length(btrim("category")) > 0),
    CONSTRAINT "cost_codes_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "cost_types" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "cost_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cost_types_code_not_blank" CHECK (length(btrim("code")) > 0),
    CONSTRAINT "cost_types_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "cost_types_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "project_cost_codes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "wbs_node_id" UUID NOT NULL,
    "cost_code_id" UUID NOT NULL,
    "cost_type_id" UUID NOT NULL,
    "is_posting_allowed" BOOLEAN NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "project_cost_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_cost_codes_status_not_blank" CHECK (length(btrim("status")) > 0)
);

-- Root and child sibling codes need separate partial unique indexes because
-- PostgreSQL treats NULL parent_id values as distinct in a normal unique key.
CREATE UNIQUE INDEX "wbs_nodes_root_code_uq"
    ON "wbs_nodes"("project_id", "code")
    WHERE "parent_id" IS NULL;

CREATE UNIQUE INDEX "wbs_nodes_child_code_uq"
    ON "wbs_nodes"("project_id", "parent_id", "code")
    WHERE "parent_id" IS NOT NULL;

CREATE UNIQUE INDEX "wbs_nodes_id_project_uq"
    ON "wbs_nodes"("id", "project_id");

CREATE INDEX "wbs_nodes_project_parent_sort_idx"
    ON "wbs_nodes"("project_id", "parent_id", "sort_order");

CREATE INDEX "wbs_nodes_company_status_idx"
    ON "wbs_nodes"("company_id", "status");

CREATE UNIQUE INDEX "cost_codes_company_code_uq"
    ON "cost_codes"("company_id", "code");

CREATE INDEX "cost_codes_company_status_idx"
    ON "cost_codes"("company_id", "status");

CREATE UNIQUE INDEX "cost_types_company_code_uq"
    ON "cost_types"("company_id", "code");

CREATE INDEX "cost_types_company_status_idx"
    ON "cost_types"("company_id", "status");

CREATE UNIQUE INDEX "project_cost_codes_combination_uq"
    ON "project_cost_codes"("project_id", "wbs_node_id", "cost_code_id", "cost_type_id");

CREATE INDEX "project_cost_codes_project_status_idx"
    ON "project_cost_codes"("project_id", "status");

CREATE INDEX "project_cost_codes_wbs_status_idx"
    ON "project_cost_codes"("wbs_node_id", "status");

CREATE INDEX "project_cost_codes_cost_code_status_idx"
    ON "project_cost_codes"("cost_code_id", "status");

CREATE INDEX "project_cost_codes_cost_type_status_idx"
    ON "project_cost_codes"("cost_type_id", "status");

ALTER TABLE "wbs_nodes"
    ADD CONSTRAINT "wbs_nodes_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "wbs_nodes_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "wbs_nodes_parent_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "wbs_nodes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_codes"
    ADD CONSTRAINT "cost_codes_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_types"
    ADD CONSTRAINT "cost_types_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_cost_codes"
    ADD CONSTRAINT "project_cost_codes_project_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "project_cost_codes_wbs_node_fkey"
        FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "project_cost_codes_cost_code_fkey"
        FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "project_cost_codes_cost_type_fkey"
        FOREIGN KEY ("cost_type_id") REFERENCES "cost_types"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep every child inside its parent's Project and reject hierarchy cycles.
-- This trigger complements the direct parent UUID FK without adding an
-- undocumented company_id or project_id field to the source-owned parent key.
CREATE FUNCTION "module_6_validate_wbs_parent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_project_id UUID;
BEGIN
    IF NEW."parent_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "project_id"
      INTO parent_project_id
      FROM "wbs_nodes"
     WHERE "id" = NEW."parent_id";

    IF FOUND AND parent_project_id <> NEW."project_id" THEN
        RAISE EXCEPTION 'WBS parent must belong to the same Project'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."parent_id" = NEW."id" OR EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT "id", "parent_id"
              FROM "wbs_nodes"
             WHERE "id" = NEW."parent_id"
            UNION ALL
            SELECT node."id", node."parent_id"
              FROM "wbs_nodes" node
              JOIN ancestors ancestor ON node."id" = ancestor."parent_id"
             WHERE ancestor."parent_id" IS NOT NULL
        )
        SELECT 1
          FROM ancestors
         WHERE "id" = NEW."id"
    ) THEN
        RAISE EXCEPTION 'WBS hierarchy cycle detected'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "wbs_nodes_parent_integrity"
BEFORE INSERT OR UPDATE OF "parent_id", "project_id"
ON "wbs_nodes"
FOR EACH ROW
EXECUTE FUNCTION "module_6_validate_wbs_parent"();

-- project_cost_codes does not own company_id in the source contract. Resolve
-- Company through Project and validate the three referenced classifications
-- against that trusted owner instead of adding an undocumented column.
CREATE FUNCTION "module_6_validate_project_cost_code"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    project_company_id UUID;
    wbs_project_id UUID;
    wbs_company_id UUID;
    cost_code_company_id UUID;
    cost_type_company_id UUID;
BEGIN
    SELECT "company_id"
      INTO project_company_id
      FROM "projects"
     WHERE "id" = NEW."project_id";

    SELECT "project_id", "company_id"
      INTO wbs_project_id, wbs_company_id
      FROM "wbs_nodes"
     WHERE "id" = NEW."wbs_node_id";

    SELECT "company_id"
      INTO cost_code_company_id
      FROM "cost_codes"
     WHERE "id" = NEW."cost_code_id";

    SELECT "company_id"
      INTO cost_type_company_id
      FROM "cost_types"
     WHERE "id" = NEW."cost_type_id";

    IF wbs_project_id IS DISTINCT FROM NEW."project_id"
       OR wbs_company_id IS DISTINCT FROM project_company_id
       OR cost_code_company_id IS DISTINCT FROM project_company_id
       OR cost_type_company_id IS DISTINCT FROM project_company_id THEN
        RAISE EXCEPTION 'Project cost-code mapping must use one Project Company and its WBS node'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "project_cost_codes_scope_integrity"
BEFORE INSERT OR UPDATE OF "project_id", "wbs_node_id", "cost_code_id", "cost_type_id"
ON "project_cost_codes"
FOR EACH ROW
EXECUTE FUNCTION "module_6_validate_project_cost_code"();

-- The source defines a freeze command but no durable Project-level freeze field
-- or separate cost-structure table. Pass 177 deliberately does not invent one.
