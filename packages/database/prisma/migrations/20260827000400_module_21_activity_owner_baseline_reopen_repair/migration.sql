-- Pass 376 / Module 21 repair: authorized Activity ownership and controlled baseline reopen.
ALTER TABLE "schedule_activities"
  ADD COLUMN "owner_user_id" UUID;

ALTER TABLE "schedule_activities"
  ADD CONSTRAINT "schedule_activities_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "schedule_activities_owner_user_idx"
  ON "schedule_activities" ("owner_user_id");

-- Existing Schedule rows may predate Pass 376, so owner_user_id remains nullable for history compatibility.
-- New Activity creation requires an authorized owner at the API/service boundary.
