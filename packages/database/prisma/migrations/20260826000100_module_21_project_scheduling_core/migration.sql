-- Stage 21 / Module 21 - Project Scheduling core persistence.
-- Creates exactly the five reviewed Scheduling resources with Project/WBS/User relationships.
-- Status vocabularies, advanced CPM/P6 behavior, external scheduler sync and downstream Change/Daily Report adapters are intentionally not invented.

CREATE TABLE "project_schedules" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "baseline_at" TIMESTAMPTZ(6),
    "data_date" DATE,

    CONSTRAINT "project_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_schedules_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "project_schedules_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "schedule_activities" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "parent_id" UUID,
    "activity_code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "wbs_node_id" UUID,
    "planned_start" DATE NOT NULL,
    "planned_finish" DATE NOT NULL,
    "actual_start" DATE,
    "actual_finish" DATE,
    "percent_complete" DECIMAL(7,4) NOT NULL,
    "milestone" BOOLEAN NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "schedule_activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_activities_code_not_blank" CHECK (length(btrim("activity_code")) > 0),
    CONSTRAINT "schedule_activities_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "schedule_activities_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "schedule_activities_planned_date_order" CHECK ("planned_finish" >= "planned_start"),
    CONSTRAINT "schedule_activities_percent_range" CHECK ("percent_complete" BETWEEN 0 AND 100),
    CONSTRAINT "schedule_activities_actual_finish_complete" CHECK ("actual_finish" IS NULL OR "percent_complete" = 100),
    CONSTRAINT "schedule_activities_no_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);

CREATE TABLE "schedule_dependencies" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "predecessor_activity_id" UUID NOT NULL,
    "successor_activity_id" UUID NOT NULL,
    "dependency_type" VARCHAR(8) NOT NULL,
    "lag_days" INTEGER NOT NULL,

    CONSTRAINT "schedule_dependencies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_dependencies_no_self_edge" CHECK ("predecessor_activity_id" <> "successor_activity_id"),
    CONSTRAINT "schedule_dependencies_type_first_scope" CHECK ("dependency_type" = 'FS'),
    CONSTRAINT "schedule_dependencies_lag_nonnegative" CHECK ("lag_days" >= 0)
);

CREATE TABLE "schedule_baselines" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "baseline_no" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "snapshot_json" JSONB NOT NULL,

    CONSTRAINT "schedule_baselines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schedule_progress_updates" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "data_date" DATE NOT NULL,
    "activity_id" UUID NOT NULL,
    "percent_complete" DECIMAL(7,4) NOT NULL,
    "forecast_finish" DATE,
    "remarks" TEXT NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "schedule_progress_updates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_progress_updates_percent_range" CHECK ("percent_complete" BETWEEN 0 AND 100)
);

-- The singular reviewed current-schedule API requires one current Schedule per Project.
CREATE UNIQUE INDEX "project_schedules_project_uq"
    ON "project_schedules"("project_id");
CREATE INDEX "project_schedules_company_status_idx"
    ON "project_schedules"("company_id", "status");
CREATE INDEX "project_schedules_company_data_date_idx"
    ON "project_schedules"("company_id", "data_date");

CREATE UNIQUE INDEX "schedule_activities_schedule_code_uq"
    ON "schedule_activities"("schedule_id", "activity_code");
CREATE INDEX "schedule_activities_schedule_parent_idx"
    ON "schedule_activities"("schedule_id", "parent_id");
CREATE INDEX "schedule_activities_schedule_planned_dates_idx"
    ON "schedule_activities"("schedule_id", "planned_start", "planned_finish");
CREATE INDEX "schedule_activities_schedule_milestone_status_idx"
    ON "schedule_activities"("schedule_id", "milestone", "status");
CREATE INDEX "schedule_activities_wbs_node_idx"
    ON "schedule_activities"("wbs_node_id");

CREATE INDEX "schedule_dependencies_schedule_predecessor_idx"
    ON "schedule_dependencies"("schedule_id", "predecessor_activity_id");
CREATE INDEX "schedule_dependencies_schedule_successor_idx"
    ON "schedule_dependencies"("schedule_id", "successor_activity_id");

CREATE UNIQUE INDEX "schedule_baselines_schedule_no_uq"
    ON "schedule_baselines"("schedule_id", "baseline_no");
CREATE INDEX "schedule_baselines_schedule_created_idx"
    ON "schedule_baselines"("schedule_id", "created_at");
CREATE INDEX "schedule_baselines_creator_created_idx"
    ON "schedule_baselines"("created_by", "created_at");

CREATE INDEX "schedule_progress_updates_schedule_date_idx"
    ON "schedule_progress_updates"("schedule_id", "data_date");
CREATE INDEX "schedule_progress_updates_activity_date_idx"
    ON "schedule_progress_updates"("activity_id", "data_date");
CREATE INDEX "schedule_progress_updates_updater_date_idx"
    ON "schedule_progress_updates"("updated_by", "data_date");

ALTER TABLE "project_schedules"
    ADD CONSTRAINT "project_schedules_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "project_schedules_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "schedule_activities"
    ADD CONSTRAINT "schedule_activities_schedule_fkey"
        FOREIGN KEY ("schedule_id") REFERENCES "project_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "schedule_activities_parent_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "schedule_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "schedule_activities_wbs_node_fkey"
        FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "schedule_dependencies"
    ADD CONSTRAINT "schedule_dependencies_schedule_fkey"
        FOREIGN KEY ("schedule_id") REFERENCES "project_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "schedule_dependencies_predecessor_fkey"
        FOREIGN KEY ("predecessor_activity_id") REFERENCES "schedule_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "schedule_dependencies_successor_fkey"
        FOREIGN KEY ("successor_activity_id") REFERENCES "schedule_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "schedule_baselines"
    ADD CONSTRAINT "schedule_baselines_schedule_fkey"
        FOREIGN KEY ("schedule_id") REFERENCES "project_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "schedule_baselines_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "schedule_progress_updates"
    ADD CONSTRAINT "schedule_progress_updates_schedule_fkey"
        FOREIGN KEY ("schedule_id") REFERENCES "project_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "schedule_progress_updates_activity_fkey"
        FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "schedule_progress_updates_updated_by_fkey"
        FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purpose: keep Activity parent and optional WBS references inside the Schedule Project.
CREATE FUNCTION "module_21_validate_activity_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    schedule_project_id UUID;
    parent_schedule_id UUID;
    wbs_project_id UUID;
BEGIN
    SELECT "project_id" INTO schedule_project_id
      FROM "project_schedules"
     WHERE "id" = NEW."schedule_id";

    IF NEW."parent_id" IS NOT NULL THEN
        SELECT "schedule_id" INTO parent_schedule_id
          FROM "schedule_activities"
         WHERE "id" = NEW."parent_id";

        IF parent_schedule_id IS NOT NULL
           AND parent_schedule_id IS DISTINCT FROM NEW."schedule_id" THEN
            RAISE EXCEPTION 'Schedule Activity parent must belong to the same Schedule'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."wbs_node_id" IS NOT NULL THEN
        SELECT "project_id" INTO wbs_project_id
          FROM "wbs_nodes"
         WHERE "id" = NEW."wbs_node_id";

        IF schedule_project_id IS NOT NULL
           AND wbs_project_id IS NOT NULL
           AND schedule_project_id IS DISTINCT FROM wbs_project_id THEN
            RAISE EXCEPTION 'Schedule Activity WBS node must belong to the Schedule Project'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "schedule_activities_scope_integrity"
BEFORE INSERT OR UPDATE OF "schedule_id", "parent_id", "wbs_node_id"
ON "schedule_activities"
FOR EACH ROW
EXECUTE FUNCTION "module_21_validate_activity_scope"();

-- Purpose: keep Dependency endpoints inside one Schedule and reject dependency cycles.
CREATE FUNCTION "module_21_validate_dependency_graph"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    predecessor_schedule_id UUID;
    successor_schedule_id UUID;
    cycle_found BOOLEAN;
BEGIN
    -- Serialize dependency edits for one Schedule so concurrent edges cannot bypass cycle checks.
    PERFORM 1
      FROM "project_schedules"
     WHERE "id" = NEW."schedule_id"
     FOR UPDATE;

    SELECT "schedule_id" INTO predecessor_schedule_id
      FROM "schedule_activities"
     WHERE "id" = NEW."predecessor_activity_id";

    SELECT "schedule_id" INTO successor_schedule_id
      FROM "schedule_activities"
     WHERE "id" = NEW."successor_activity_id";

    IF predecessor_schedule_id IS NOT NULL
       AND predecessor_schedule_id IS DISTINCT FROM NEW."schedule_id" THEN
        RAISE EXCEPTION 'Schedule Dependency predecessor must belong to the same Schedule'
            USING ERRCODE = '23514';
    END IF;

    IF successor_schedule_id IS NOT NULL
       AND successor_schedule_id IS DISTINCT FROM NEW."schedule_id" THEN
        RAISE EXCEPTION 'Schedule Dependency successor must belong to the same Schedule'
            USING ERRCODE = '23514';
    END IF;

    IF predecessor_schedule_id IS NULL OR successor_schedule_id IS NULL THEN
        RETURN NEW;
    END IF;

    WITH RECURSIVE reachable("activity_id") AS (
        SELECT dependency."successor_activity_id"
          FROM "schedule_dependencies" dependency
         WHERE dependency."schedule_id" = NEW."schedule_id"
           AND dependency."predecessor_activity_id" = NEW."successor_activity_id"
           AND dependency."id" <> NEW."id"
        UNION
        SELECT dependency."successor_activity_id"
          FROM "schedule_dependencies" dependency
          JOIN reachable
            ON dependency."predecessor_activity_id" = reachable."activity_id"
         WHERE dependency."schedule_id" = NEW."schedule_id"
           AND dependency."id" <> NEW."id"
    )
    SELECT EXISTS (
        SELECT 1
          FROM reachable
         WHERE "activity_id" = NEW."predecessor_activity_id"
    ) INTO cycle_found;

    IF cycle_found THEN
        RAISE EXCEPTION 'Schedule Dependency graph must not contain cycles'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "schedule_dependencies_graph_integrity"
BEFORE INSERT OR UPDATE OF "schedule_id", "predecessor_activity_id", "successor_activity_id"
ON "schedule_dependencies"
FOR EACH ROW
EXECUTE FUNCTION "module_21_validate_dependency_graph"();

-- Purpose: keep baseline creator identity inside the Schedule Company.
CREATE FUNCTION "module_21_validate_baseline_actor_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    schedule_company_id UUID;
    actor_company_id UUID;
BEGIN
    SELECT "company_id" INTO schedule_company_id
      FROM "project_schedules"
     WHERE "id" = NEW."schedule_id";

    SELECT "company_id" INTO actor_company_id
      FROM "users"
     WHERE "id" = NEW."created_by";

    IF schedule_company_id IS NOT NULL
       AND actor_company_id IS NOT NULL
       AND schedule_company_id IS DISTINCT FROM actor_company_id THEN
        RAISE EXCEPTION 'Schedule Baseline creator must belong to the Schedule Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "schedule_baselines_actor_scope_integrity"
BEFORE INSERT ON "schedule_baselines"
FOR EACH ROW
EXECUTE FUNCTION "module_21_validate_baseline_actor_scope"();

-- Purpose: keep reviewed Schedule baseline history immutable after insertion.
CREATE FUNCTION "module_21_prevent_baseline_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Schedule Baseline snapshots are immutable'
        USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "schedule_baselines_immutable"
BEFORE UPDATE OR DELETE ON "schedule_baselines"
FOR EACH ROW
EXECUTE FUNCTION "module_21_prevent_baseline_mutation"();

-- Purpose: keep progress Activity and updater identity inside the same Schedule and Company.
CREATE FUNCTION "module_21_validate_progress_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    schedule_company_id UUID;
    activity_schedule_id UUID;
    updater_company_id UUID;
BEGIN
    SELECT "company_id" INTO schedule_company_id
      FROM "project_schedules"
     WHERE "id" = NEW."schedule_id";

    SELECT "schedule_id" INTO activity_schedule_id
      FROM "schedule_activities"
     WHERE "id" = NEW."activity_id";

    SELECT "company_id" INTO updater_company_id
      FROM "users"
     WHERE "id" = NEW."updated_by";

    IF activity_schedule_id IS NOT NULL
       AND activity_schedule_id IS DISTINCT FROM NEW."schedule_id" THEN
        RAISE EXCEPTION 'Schedule Progress Activity must belong to the same Schedule'
            USING ERRCODE = '23514';
    END IF;

    IF schedule_company_id IS NOT NULL
       AND updater_company_id IS NOT NULL
       AND schedule_company_id IS DISTINCT FROM updater_company_id THEN
        RAISE EXCEPTION 'Schedule Progress updater must belong to the Schedule Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "schedule_progress_updates_scope_integrity"
BEFORE INSERT OR UPDATE OF "schedule_id", "activity_id", "updated_by"
ON "schedule_progress_updates"
FOR EACH ROW
EXECUTE FUNCTION "module_21_validate_progress_scope"();

-- Purpose: keep historical progress evidence append-only after insertion.
CREATE FUNCTION "module_21_prevent_progress_update_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Schedule Progress Update history is append-only'
        USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "schedule_progress_updates_immutable"
BEFORE UPDATE OR DELETE ON "schedule_progress_updates"
FOR EACH ROW
EXECUTE FUNCTION "module_21_prevent_progress_update_mutation"();

