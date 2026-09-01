-- Final-21 Repair R9: align Administration permission persistence to the final Module 2 contract.
-- Historical migrations remain immutable. This forward migration preserves existing grants while
-- making permissions.code the stable identifier and role_permissions.permission_code the relation key.

ALTER TABLE "permissions"
  ADD COLUMN IF NOT EXISTS "description" VARCHAR(500);

UPDATE "permissions"
SET "description" = COALESCE(NULLIF(btrim("name"), ''), "code")
WHERE "description" IS NULL;

ALTER TABLE "permissions"
  ALTER COLUMN "description" SET NOT NULL;

ALTER TABLE "role_permissions"
  ADD COLUMN IF NOT EXISTS "permission_code" VARCHAR(150);

UPDATE "role_permissions" AS role_permission
SET "permission_code" = permission."code"
FROM "permissions" AS permission
WHERE permission."id" = role_permission."permission_id"
  AND role_permission."permission_code" IS NULL;

-- Fail closed rather than silently dropping an existing grant that cannot be resolved.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "role_permissions"
    WHERE "permission_code" IS NULL
  ) THEN
    RAISE EXCEPTION 'Final-21 permission alignment found an unresolved role permission'
      USING ERRCODE = '23503';
  END IF;
END;
$$;

-- Remove the old UUID relationship only after every grant has a stable permission code.
ALTER TABLE "role_permissions"
  DROP CONSTRAINT IF EXISTS "role_permissions_pkey",
  DROP CONSTRAINT IF EXISTS "role_permissions_permission_fkey";

DROP INDEX IF EXISTS "role_permissions_permission_idx";

ALTER TABLE "role_permissions"
  ALTER COLUMN "permission_code" SET NOT NULL,
  DROP COLUMN "permission_id";

-- Reuse the existing unique code index as the canonical Permission primary key.
ALTER TABLE "permissions"
  DROP CONSTRAINT IF EXISTS "permissions_pkey";

ALTER TABLE "permissions"
  ADD CONSTRAINT "permissions_pkey" PRIMARY KEY USING INDEX "permissions_code_uq";

ALTER TABLE "permissions"
  DROP CONSTRAINT IF EXISTS "permissions_name_not_blank",
  DROP COLUMN "id",
  DROP COLUMN "name";

ALTER TABLE "permissions"
  ADD CONSTRAINT "permissions_description_not_blank"
    CHECK (length(btrim("description")) > 0);

ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_permission_fkey"
    FOREIGN KEY ("permission_code") REFERENCES "permissions"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "role_permissions_pkey"
    PRIMARY KEY ("role_id", "permission_code");

CREATE INDEX "role_permissions_permission_idx"
  ON "role_permissions"("permission_code");
