-- Final-21 B3: align Client Management persistence with final Module 4.
-- Keep historical rows while allowing optional contact communication fields and nullable credit terms.
ALTER TABLE "clients"
  ALTER COLUMN "credit_terms_days" DROP DEFAULT,
  ALTER COLUMN "credit_terms_days" DROP NOT NULL;

ALTER TABLE "client_contacts"
  ALTER COLUMN "title" DROP NOT NULL,
  ALTER COLUMN "email" DROP NOT NULL,
  ALTER COLUMN "phone" DROP NOT NULL;

-- The composite FK already enforces same-company ownership. Remove the redundant client-only FK.
ALTER TABLE "client_contacts"
  DROP CONSTRAINT IF EXISTS "client_contacts_client_id_fkey";
