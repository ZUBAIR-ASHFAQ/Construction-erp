-- Record the approval authority represented by every direct or delegated action.
-- Existing actions were direct/actor-keyed, so their represented approver starts as the actor.

ALTER TABLE "approval_actions"
    ADD COLUMN "represented_approver_user_id" UUID;

UPDATE "approval_actions"
SET "represented_approver_user_id" = "actor_user_id"
WHERE "represented_approver_user_id" IS NULL;

ALTER TABLE "approval_actions"
    ALTER COLUMN "represented_approver_user_id" SET NOT NULL;

ALTER TABLE "approval_actions"
    ADD CONSTRAINT "approval_actions_represented_approver_fkey"
        FOREIGN KEY ("represented_approver_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "approval_actions_request_step_represented_uq"
    ON "approval_actions"("approval_request_id", "step_no", "represented_approver_user_id");
