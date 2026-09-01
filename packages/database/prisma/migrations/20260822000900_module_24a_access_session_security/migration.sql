-- Pass 39 separates short-lived Bearer access credentials from refresh credentials.
ALTER TABLE "auth_sessions"
  ADD COLUMN "access_token_hash" VARCHAR(255),
  ADD COLUMN "access_expires_at" TIMESTAMPTZ(6);

-- Existing Pass-38 sessions cannot be safely converted because their Bearer token was
-- also the refresh token. Mark them with an unusable unique value and an expired time
-- so users sign in again after this security migration.
UPDATE "auth_sessions"
SET
  "access_token_hash" = 'legacy-expired:' || "id"::text,
  "access_expires_at" = "created_at"
WHERE "access_token_hash" IS NULL;

ALTER TABLE "auth_sessions"
  ALTER COLUMN "access_token_hash" SET NOT NULL,
  ALTER COLUMN "access_expires_at" SET NOT NULL;

CREATE UNIQUE INDEX "auth_sessions_access_token_hash_uq"
  ON "auth_sessions"("access_token_hash");

CREATE INDEX "auth_sessions_user_access_expires_at_idx"
  ON "auth_sessions"("user_id", "access_expires_at");
