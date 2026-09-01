-- Pass 50 / Stage 2: short-lived upload intent metadata for Module 18.
-- The first document row is created only after upload verification, so
-- target_document_id is a preallocated UUID and intentionally has no FK yet.
CREATE TABLE "document_upload_intents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "target_document_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "folder_id" UUID,
    "title" VARCHAR(300) NOT NULL,
    "document_no" VARCHAR(120),
    "category" VARCHAR(100) NOT NULL,
    "original_name" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_upload_intents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_upload_intents_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "document_upload_intents_actor_fkey"
        FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "document_upload_intents_folder_fkey"
        FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "document_upload_intents_title_not_blank" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "document_upload_intents_document_no_not_blank" CHECK ("document_no" IS NULL OR length(btrim("document_no")) > 0),
    CONSTRAINT "document_upload_intents_category_not_blank" CHECK (length(btrim("category")) > 0),
    CONSTRAINT "document_upload_intents_original_name_not_blank" CHECK (length(btrim("original_name")) > 0),
    CONSTRAINT "document_upload_intents_mime_type_not_blank" CHECK (length(btrim("mime_type")) > 0),
    CONSTRAINT "document_upload_intents_size_positive" CHECK ("size_bytes" > 0),
    CONSTRAINT "document_upload_intents_checksum_not_blank" CHECK (length(btrim("checksum")) > 0),
    CONSTRAINT "document_upload_intents_storage_key_not_blank" CHECK (length(btrim("storage_key")) > 0)
);

CREATE UNIQUE INDEX "document_upload_intents_storage_key_uq"
    ON "document_upload_intents"("storage_key");
CREATE INDEX "document_upload_intents_company_expires_at_idx"
    ON "document_upload_intents"("company_id", "expires_at");
CREATE INDEX "document_upload_intents_actor_created_at_idx"
    ON "document_upload_intents"("actor_user_id", "created_at");
CREATE INDEX "document_upload_intents_target_document_idx"
    ON "document_upload_intents"("target_document_id");
