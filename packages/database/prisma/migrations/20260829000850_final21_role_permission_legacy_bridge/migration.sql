-- Compatibility bridge for two already-authored Final-21 migrations that still address
-- role_permissions by permission_code. The final Administration schema owns permission_id.
-- This bridge does not rewrite historical migrations; B7 removes the temporary column.

ALTER TABLE "role_permissions"
  ADD COLUMN IF NOT EXISTS "permission_code" VARCHAR(150);

UPDATE "role_permissions" rp
SET "permission_code" = p."code"
FROM "permissions" p
WHERE p."id" = rp."permission_id"
  AND rp."permission_code" IS NULL;

CREATE OR REPLACE FUNCTION "final21_sync_role_permission_legacy_code"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."permission_id" IS NULL AND NEW."permission_code" IS NOT NULL THEN
    SELECT p."id" INTO NEW."permission_id"
    FROM "permissions" p
    WHERE p."code" = NEW."permission_code";
  END IF;

  IF NEW."permission_code" IS NULL AND NEW."permission_id" IS NOT NULL THEN
    SELECT p."code" INTO NEW."permission_code"
    FROM "permissions" p
    WHERE p."id" = NEW."permission_id";
  END IF;

  IF NEW."permission_id" IS NULL OR NEW."permission_code" IS NULL THEN
    RAISE EXCEPTION 'Role permission must resolve to one known permission'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "final21_role_permission_legacy_code_sync" ON "role_permissions";
CREATE TRIGGER "final21_role_permission_legacy_code_sync"
BEFORE INSERT OR UPDATE OF "permission_id", "permission_code"
ON "role_permissions"
FOR EACH ROW
EXECUTE FUNCTION "final21_sync_role_permission_legacy_code"();
