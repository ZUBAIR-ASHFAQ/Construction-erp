-- Pass 40 adds one-time invitation/password-reset state without storing raw tokens.
ALTER TABLE "users"
  ADD COLUMN "auth_action_nonce" VARCHAR(64),
  ADD COLUMN "auth_action_purpose" VARCHAR(32),
  ADD COLUMN "auth_action_expires_at" TIMESTAMPTZ(6);

ALTER TABLE "users"
  ADD CONSTRAINT "users_auth_action_complete" CHECK (
    ("auth_action_nonce" IS NULL AND "auth_action_purpose" IS NULL AND "auth_action_expires_at" IS NULL)
    OR
    (
      "auth_action_nonce" IS NOT NULL
      AND "auth_action_purpose" IN ('INVITATION', 'PASSWORD_RESET')
      AND "auth_action_expires_at" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "users_auth_action_nonce_not_blank" CHECK (
    "auth_action_nonce" IS NULL OR length(btrim("auth_action_nonce")) > 0
  );

CREATE INDEX "users_auth_action_expiry_idx"
  ON "users"("auth_action_purpose", "auth_action_expires_at")
  WHERE "auth_action_purpose" IS NOT NULL;
