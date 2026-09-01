-- Pass 87 / Stage 2: harden Module 18 ownership relationships at the database boundary.
-- Existing service/repository scope checks remain the first line of defense. These
-- constraints stop accidental cross-company links or a mismatched current version
-- even if a future code bug attempts an invalid write.

-- Composite unique keys are required by PostgreSQL composite foreign keys.
CREATE UNIQUE INDEX "users_id_company_uq"
    ON "users"("id", "company_id");

CREATE UNIQUE INDEX "document_folders_id_company_uq"
    ON "document_folders"("id", "company_id");

CREATE UNIQUE INDEX "documents_id_company_uq"
    ON "documents"("id", "company_id");

CREATE UNIQUE INDEX "document_versions_document_id_id_uq"
    ON "document_versions"("document_id", "id");

-- A folder can only use a parent from the same company.
ALTER TABLE "document_folders"
    ADD CONSTRAINT "document_folders_parent_company_fkey"
    FOREIGN KEY ("parent_id", "company_id")
    REFERENCES "document_folders"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Document folder and owner must belong to the same company as the document.
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_folder_company_fkey"
    FOREIGN KEY ("folder_id", "company_id")
    REFERENCES "document_folders"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "documents_owner_company_fkey"
    FOREIGN KEY ("owner_user_id", "company_id")
    REFERENCES "users"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The selected current version must belong to the same document.
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_current_version_belongs_to_document_fkey"
    FOREIGN KEY ("id", "current_version_id")
    REFERENCES "document_versions"("document_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Upload intent actor, folder and existing document must stay in the intent company.
ALTER TABLE "document_upload_intents"
    ADD CONSTRAINT "document_upload_intents_actor_company_fkey"
    FOREIGN KEY ("actor_user_id", "company_id")
    REFERENCES "users"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "document_upload_intents_folder_company_fkey"
    FOREIGN KEY ("folder_id", "company_id")
    REFERENCES "document_folders"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "document_upload_intents_document_company_fkey"
    FOREIGN KEY ("document_id", "company_id")
    REFERENCES "documents"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
