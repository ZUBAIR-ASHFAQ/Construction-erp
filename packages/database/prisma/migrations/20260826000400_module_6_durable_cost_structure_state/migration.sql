-- Pass 359: make Module 6 WBS / cost-structure freeze durable without changing the approved business-module count.
CREATE TABLE "project_cost_structure_states" (
    "project_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "frozen_at" TIMESTAMPTZ(6),
    "frozen_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_cost_structure_states_pkey" PRIMARY KEY ("project_id"),
    CONSTRAINT "project_cost_structure_states_status_check" CHECK ("status" IN ('OPEN', 'FROZEN')),
    CONSTRAINT "project_cost_structure_states_revision_check" CHECK ("revision_no" >= 1),
    CONSTRAINT "project_cost_structure_states_freeze_shape_check" CHECK (
        ("status" = 'OPEN' AND "frozen_at" IS NULL AND "frozen_by" IS NULL)
        OR ("status" = 'FROZEN' AND "frozen_at" IS NOT NULL)
    ),
    CONSTRAINT "project_cost_structure_states_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_cost_structure_states_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "project_cost_structure_states_frozen_by_company_fkey"
        FOREIGN KEY ("frozen_by", "company_id") REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "project_cost_structure_states_company_status_idx"
    ON "project_cost_structure_states"("company_id", "status");
CREATE INDEX "project_cost_structure_states_frozen_by_idx"
    ON "project_cost_structure_states"("frozen_by");

-- Preserve the meaning of freeze commands already accepted before Pass 359.
-- Module 6 had no reopen command before this migration, so the latest historical freeze means the Project is still frozen.
WITH latest_freeze AS (
    SELECT DISTINCT ON (a."company_id", a."entity_id")
        p."id" AS "project_id",
        p."company_id",
        a."created_at" AS "frozen_at",
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM "users" u
                WHERE u."id" = a."actor_user_id"
                  AND u."company_id" = a."company_id"
            ) THEN a."actor_user_id"
            ELSE NULL
        END AS "frozen_by"
    FROM "audit_logs" a
    INNER JOIN "projects" p
        ON p."company_id" = a."company_id"
       AND p."id"::text = a."entity_id"
    WHERE a."entity_type" = 'project'
      AND a."action" = 'project.cost_structure_frozen'
    ORDER BY a."company_id", a."entity_id", a."created_at" DESC, a."id" DESC
)
INSERT INTO "project_cost_structure_states" (
    "project_id",
    "company_id",
    "status",
    "revision_no",
    "frozen_at",
    "frozen_by"
)
SELECT
    "project_id",
    "company_id",
    'FROZEN',
    1,
    "frozen_at",
    "frozen_by"
FROM latest_freeze;

-- Reject direct WBS or Project mapping mutations while the durable Project cost structure is frozen.
CREATE FUNCTION "module_6_reject_frozen_cost_structure_write"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "project_cost_structure_states" state
        WHERE state."status" = 'FROZEN'
          AND (
              state."project_id" = CASE WHEN TG_OP = 'INSERT' THEN NEW."project_id" ELSE OLD."project_id" END
              OR (TG_OP = 'UPDATE' AND state."project_id" = NEW."project_id")
          )
    ) THEN
        RAISE EXCEPTION 'Project cost structure is frozen'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "wbs_nodes_reject_frozen_cost_structure_write"
BEFORE INSERT OR UPDATE OR DELETE ON "wbs_nodes"
FOR EACH ROW EXECUTE FUNCTION "module_6_reject_frozen_cost_structure_write"();

CREATE TRIGGER "project_cost_codes_reject_frozen_cost_structure_write"
BEFORE INSERT OR UPDATE OR DELETE ON "project_cost_codes"
FOR EACH ROW EXECUTE FUNCTION "module_6_reject_frozen_cost_structure_write"();
