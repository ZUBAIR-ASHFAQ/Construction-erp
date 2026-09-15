-- One-time repair for the authoritative initial System Administrator credential.
-- The plaintext password is not stored; this is a scrypt-v1 hash produced by the
-- same algorithm used by apps/api/src/plugins/authentication.ts.

DO $$
DECLARE
  bootstrap_run_id UUID;
  administrator_id UUID;
  administrator_company_id UUID;
  administrator_name TEXT;
  system_admin_role_id UUID;
  matching_login_count INTEGER;
BEGIN
  SELECT
    bootstrap."id",
    bootstrap."administrator_user_id",
    bootstrap."company_id",
    bootstrap."administrator_name"
  INTO
    bootstrap_run_id,
    administrator_id,
    administrator_company_id,
    administrator_name
  FROM "initial_bootstrap_runs" bootstrap
  WHERE bootstrap."bootstrap_key" = 'initial';

  IF bootstrap_run_id IS NULL OR administrator_company_id IS NULL THEN
    RAISE EXCEPTION 'Cannot repair admin credentials: initial bootstrap record was not found.';
  END IF;

  IF administrator_id IS NOT NULL THEN
    PERFORM 1
    FROM "users" administrator
    WHERE administrator."id" = administrator_id
      AND administrator."company_id" = administrator_company_id;

    IF NOT FOUND THEN
      administrator_id := NULL;
    END IF;
  END IF;

  IF administrator_id IS NULL THEN
    SELECT administrator."id"
    INTO administrator_id
    FROM "users" administrator
    WHERE administrator."company_id" = administrator_company_id
      AND administrator."email" = 'admin@example.com';
  END IF;

  IF administrator_id IS NULL THEN
    INSERT INTO "users" (
      "id",
      "company_id",
      "email",
      "name",
      "status",
      "password_hash",
      "password_changed_at",
      "created_at",
      "updated_at"
    )
    VALUES (
      gen_random_uuid(),
      administrator_company_id,
      'admin@example.com',
      COALESCE(NULLIF(administrator_name, ''), 'System Administrator'),
      'ACTIVE',
      'scrypt-v1:mSLh6CY3S8NIQiVOlW02uQ:v-okd4vNTCKxtOPsYML6uuj9hj1kztnGFbeg244WsD4nafG4H_2dxL9dFfaIaR8YxIVGaWxPlJjCPvGmtifxvw',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    RETURNING "id" INTO administrator_id;
  END IF;

  SELECT COUNT(*)
  INTO matching_login_count
  FROM "users" candidate
  WHERE candidate."email" = 'admin@example.com'
    AND candidate."id" <> administrator_id;

  IF matching_login_count <> 0 THEN
    RAISE EXCEPTION 'Cannot repair admin credentials: admin@example.com is already used by another user.';
  END IF;

  UPDATE "users"
  SET
    "email" = 'admin@example.com',
    "status" = 'ACTIVE',
    "password_hash" = 'scrypt-v1:mSLh6CY3S8NIQiVOlW02uQ:v-okd4vNTCKxtOPsYML6uuj9hj1kztnGFbeg244WsD4nafG4H_2dxL9dFfaIaR8YxIVGaWxPlJjCPvGmtifxvw',
    "password_changed_at" = CURRENT_TIMESTAMP,
    "auth_action_nonce" = NULL,
    "auth_action_purpose" = NULL,
    "auth_action_expires_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = administrator_id
    AND "company_id" = administrator_company_id;

  INSERT INTO "roles" (
    "id",
    "company_id",
    "code",
    "name",
    "is_system",
    "status",
    "created_at",
    "updated_at"
  )
  VALUES (
    gen_random_uuid(),
    administrator_company_id,
    'system-admin',
    'System Administrator',
    TRUE,
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("company_id", "code") DO UPDATE SET
    "is_system" = TRUE,
    "status" = 'ACTIVE',
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id" INTO system_admin_role_id;

  INSERT INTO "role_permissions" ("role_id", "permission_code")
  SELECT system_admin_role_id, permission."code"
  FROM "permissions" permission
  ON CONFLICT ("role_id", "permission_code") DO NOTHING;

  INSERT INTO "user_roles" ("id", "company_id", "user_id", "role_id", "status", "created_at")
  VALUES (
    gen_random_uuid(),
    administrator_company_id,
    administrator_id,
    system_admin_role_id,
    'ACTIVE',
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("company_id", "user_id", "role_id")
  DO UPDATE SET "status" = 'ACTIVE';

  UPDATE "initial_bootstrap_runs"
  SET
    "status" = 'COMPLETED',
    "administrator_email" = 'admin@example.com',
    "administrator_user_id" = administrator_id,
    "system_role_ids_by_code" = COALESCE("system_role_ids_by_code", '{}'::jsonb)
      || jsonb_build_object('system-admin', system_admin_role_id::text),
    "completed_at" = COALESCE("completed_at", CURRENT_TIMESTAMP),
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = bootstrap_run_id;

  UPDATE "auth_sessions"
  SET "revoked_at" = CURRENT_TIMESTAMP
  WHERE "user_id" = administrator_id
    AND "revoked_at" IS NULL;
END $$;
