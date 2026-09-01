-- Stage 17 / Module 12 - Equipment Management core persistence.
-- Creates exactly the four reviewed Equipment resources. Public route/schema/service behavior remains deferred.
-- Child tables intentionally do not invent company_id columns; same-Company integrity is enforced through their reviewed parents.
-- equipment_usage.cost_structure_id is persisted as the existing Module-6 Project posting-combination key project_cost_codes.id.

CREATE TABLE "equipment" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "equipment_code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "ownership_type" VARCHAR(64) NOT NULL,
    "serial_no" VARCHAR(120),
    "plate_no" VARCHAR(50),
    "status" VARCHAR(32) NOT NULL,
    "cost_rate_per_hour" DECIMAL(18,4),

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equipment_code_not_blank" CHECK (length(btrim("equipment_code")) > 0),
    CONSTRAINT "equipment_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "equipment_category_not_blank" CHECK (length(btrim("category")) > 0),
    CONSTRAINT "equipment_ownership_type_not_blank" CHECK (length(btrim("ownership_type")) > 0),
    CONSTRAINT "equipment_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "equipment_cost_rate_nonnegative" CHECK ("cost_rate_per_hour" IS NULL OR "cost_rate_per_hour" >= 0)
);

CREATE TABLE "equipment_assignments" (
    "id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "status" VARCHAR(32) NOT NULL,
    "assigned_by" UUID NOT NULL,

    CONSTRAINT "equipment_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equipment_assignments_date_order" CHECK ("to_date" IS NULL OR "to_date" >= "from_date"),
    CONSTRAINT "equipment_assignments_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "equipment_usage" (
    "id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "usage_date" DATE NOT NULL,
    "hours" DECIMAL(18,4) NOT NULL,
    "meter_start" DECIMAL(18,4),
    "meter_end" DECIMAL(18,4),
    "fuel_qty" DECIMAL(18,4),
    "cost_amount" DECIMAL(18,2) NOT NULL,
    "cost_structure_id" UUID,

    CONSTRAINT "equipment_usage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equipment_usage_hours_nonnegative" CHECK ("hours" >= 0),
    CONSTRAINT "equipment_usage_meter_start_nonnegative" CHECK ("meter_start" IS NULL OR "meter_start" >= 0),
    CONSTRAINT "equipment_usage_meter_end_nonnegative" CHECK ("meter_end" IS NULL OR "meter_end" >= 0),
    CONSTRAINT "equipment_usage_meter_order" CHECK ("meter_start" IS NULL OR "meter_end" IS NULL OR "meter_end" >= "meter_start")
);

CREATE TABLE "equipment_maintenance" (
    "id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "maintenance_type" VARCHAR(120) NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "completed_date" DATE,
    "meter_reading" DECIMAL(18,4),
    "cost" DECIMAL(18,2) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "equipment_maintenance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equipment_maintenance_type_not_blank" CHECK (length(btrim("maintenance_type")) > 0),
    CONSTRAINT "equipment_maintenance_meter_nonnegative" CHECK ("meter_reading" IS NULL OR "meter_reading" >= 0),
    CONSTRAINT "equipment_maintenance_status_not_blank" CHECK (length(btrim("status")) > 0)
);

-- Equipment code uniqueness is explicitly required inside the Company.
CREATE UNIQUE INDEX "equipment_company_code_uq" ON "equipment"("company_id", "equipment_code");
CREATE INDEX "equipment_company_status_idx" ON "equipment"("company_id", "status");
CREATE INDEX "equipment_company_category_status_idx" ON "equipment"("company_id", "category", "status");

CREATE INDEX "equipment_assignments_equipment_dates_idx"
    ON "equipment_assignments"("equipment_id", "from_date", "to_date");
CREATE INDEX "equipment_assignments_project_dates_idx"
    ON "equipment_assignments"("project_id", "from_date", "to_date");

CREATE INDEX "equipment_usage_equipment_date_idx"
    ON "equipment_usage"("equipment_id", "usage_date");
CREATE INDEX "equipment_usage_project_date_idx"
    ON "equipment_usage"("project_id", "usage_date");
CREATE INDEX "equipment_usage_cost_structure_date_idx"
    ON "equipment_usage"("cost_structure_id", "usage_date");

CREATE INDEX "equipment_maintenance_equipment_scheduled_idx"
    ON "equipment_maintenance"("equipment_id", "scheduled_date");
CREATE INDEX "equipment_maintenance_equipment_status_scheduled_idx"
    ON "equipment_maintenance"("equipment_id", "status", "scheduled_date");

ALTER TABLE "equipment"
    ADD CONSTRAINT "equipment_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipment_assignments"
    ADD CONSTRAINT "equipment_assignments_equipment_fkey"
        FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "equipment_assignments_project_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "equipment_assignments_assigned_by_fkey"
        FOREIGN KEY ("assigned_by") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipment_usage"
    ADD CONSTRAINT "equipment_usage_equipment_fkey"
        FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "equipment_usage_project_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "equipment_usage_cost_structure_fkey"
        FOREIGN KEY ("cost_structure_id") REFERENCES "project_cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipment_maintenance"
    ADD CONSTRAINT "equipment_maintenance_equipment_fkey"
        FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purpose: enforce same-Company Equipment/Project/actor scope and the source-required fail-closed assignment overlap rule.
CREATE FUNCTION "module_12_validate_equipment_assignment_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    equipment_company_id UUID;
    project_company_id UUID;
    actor_company_id UUID;
BEGIN
    SELECT "company_id" INTO equipment_company_id
      FROM "equipment"
     WHERE "id" = NEW."equipment_id";

    SELECT "company_id" INTO project_company_id
      FROM "projects"
     WHERE "id" = NEW."project_id";

    SELECT "company_id" INTO actor_company_id
      FROM "users"
     WHERE "id" = NEW."assigned_by";

    IF equipment_company_id IS DISTINCT FROM project_company_id
       OR equipment_company_id IS DISTINCT FROM actor_company_id THEN
        RAISE EXCEPTION 'Equipment assignment Equipment, Project and actor must belong to the same Company'
            USING ERRCODE = '23514';
    END IF;

    -- Serialize overlap checks per Equipment so concurrent inserts cannot both pass the same availability check.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."equipment_id"::text, 0));

    IF EXISTS (
        SELECT 1
          FROM "equipment_assignments" existing
         WHERE existing."equipment_id" = NEW."equipment_id"
           AND existing."id" <> NEW."id"
           AND existing."from_date" <= COALESCE(NEW."to_date", 'infinity'::date)
           AND NEW."from_date" <= COALESCE(existing."to_date", 'infinity'::date)
    ) THEN
        RAISE EXCEPTION 'Equipment assignment periods may not overlap'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "equipment_assignments_scope_integrity"
BEFORE INSERT OR UPDATE OF "equipment_id", "project_id", "from_date", "to_date", "assigned_by"
ON "equipment_assignments"
FOR EACH ROW
EXECUTE FUNCTION "module_12_validate_equipment_assignment_scope"();

-- Purpose: keep usage on the Equipment Company/Project and resolve cost_structure_id to the same Project posting combination.
CREATE FUNCTION "module_12_validate_equipment_usage_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    equipment_company_id UUID;
    project_company_id UUID;
    mapping_project_id UUID;
BEGIN
    SELECT "company_id" INTO equipment_company_id
      FROM "equipment"
     WHERE "id" = NEW."equipment_id";

    SELECT "company_id" INTO project_company_id
      FROM "projects"
     WHERE "id" = NEW."project_id";

    IF equipment_company_id IS DISTINCT FROM project_company_id THEN
        RAISE EXCEPTION 'Equipment usage Equipment and Project must belong to the same Company'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."cost_structure_id" IS NOT NULL THEN
        SELECT "project_id" INTO mapping_project_id
          FROM "project_cost_codes"
         WHERE "id" = NEW."cost_structure_id";

        IF mapping_project_id IS DISTINCT FROM NEW."project_id" THEN
            RAISE EXCEPTION 'Equipment usage cost structure must belong to the usage Project'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "equipment_usage_scope_integrity"
BEFORE INSERT OR UPDATE OF "equipment_id", "project_id", "cost_structure_id"
ON "equipment_usage"
FOR EACH ROW
EXECUTE FUNCTION "module_12_validate_equipment_usage_scope"();
