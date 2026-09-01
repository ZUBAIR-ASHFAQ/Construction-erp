-- Pass 52 / Stage 2: support upload intents for a new version of an existing document.
-- document_id is a real FK for existing-document version intents.
-- target_document_id remains the preallocated id used by first-document intents.
ALTER TABLE "document_upload_intents"
    ADD COLUMN "document_id" UUID,
    ADD COLUMN "revision_code" VARCHAR(100);

ALTER TABLE "document_upload_intents"
    ADD CONSTRAINT "document_upload_intents_document_fkey"
        FOREIGN KEY ("document_id") REFERENCES "documents"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "document_upload_intents_revision_code_not_blank"
        CHECK ("revision_code" IS NULL OR length(btrim("revision_code")) > 0);

CREATE INDEX "document_upload_intents_document_idx"
    ON "document_upload_intents"("document_id");
