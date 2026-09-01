-- Pass 47 / Stage 2: Module 18 Document Management core persistence.
-- Creates company-scoped document folders, document metadata, immutable file
-- version metadata and generic document links. Project Management (Module 5)
-- and Module 24B do not yet exist, so no project_id column/FK is introduced.

CREATE TABLE "document_folders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(240) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_folders_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "document_folders_parent_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "document_folders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "document_folders_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "document_folders_category_not_blank" CHECK (length(btrim("category")) > 0),
    CONSTRAINT "document_folders_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "document_folders_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);

CREATE INDEX "document_folders_company_status_idx"
    ON "document_folders"("company_id", "status");
CREATE INDEX "document_folders_company_category_idx"
    ON "document_folders"("company_id", "category");
CREATE INDEX "document_folders_company_parent_idx"
    ON "document_folders"("company_id", "parent_id");

-- current_version_id is stored now but its FK is added only after
-- document_versions exists later in this same reviewed gate.
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "folder_id" UUID,
    "title" VARCHAR(300) NOT NULL,
    "document_no" VARCHAR(120),
    "category" VARCHAR(100) NOT NULL,
    "current_version_id" UUID,
    "status" VARCHAR(32) NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documents_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "documents_folder_fkey"
        FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "documents_owner_user_fkey"
        FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "documents_title_not_blank" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "documents_document_no_not_blank" CHECK ("document_no" IS NULL OR length(btrim("document_no")) > 0),
    CONSTRAINT "documents_category_not_blank" CHECK (length(btrim("category")) > 0),
    CONSTRAINT "documents_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE UNIQUE INDEX "documents_current_version_uq"
    ON "documents"("current_version_id");
CREATE INDEX "documents_company_status_idx"
    ON "documents"("company_id", "status");
CREATE INDEX "documents_company_category_idx"
    ON "documents"("company_id", "category");
CREATE INDEX "documents_company_document_no_idx"
    ON "documents"("company_id", "document_no");
CREATE INDEX "documents_folder_idx"
    ON "documents"("folder_id");
CREATE INDEX "documents_owner_user_idx"
    ON "documents"("owner_user_id");

CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "original_name" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "revision_code" VARCHAR(100),
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_versions_document_fkey"
        FOREIGN KEY ("document_id") REFERENCES "documents"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "document_versions_uploader_fkey"
        FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "document_versions_version_positive" CHECK ("version_no" > 0),
    CONSTRAINT "document_versions_storage_key_not_blank" CHECK (length(btrim("storage_key")) > 0),
    CONSTRAINT "document_versions_original_name_not_blank" CHECK (length(btrim("original_name")) > 0),
    CONSTRAINT "document_versions_mime_type_not_blank" CHECK (length(btrim("mime_type")) > 0),
    CONSTRAINT "document_versions_size_nonnegative" CHECK ("size_bytes" >= 0),
    CONSTRAINT "document_versions_checksum_not_blank" CHECK (length(btrim("checksum")) > 0),
    CONSTRAINT "document_versions_revision_code_not_blank" CHECK ("revision_code" IS NULL OR length(btrim("revision_code")) > 0)
);

CREATE UNIQUE INDEX "document_versions_document_version_uq"
    ON "document_versions"("document_id", "version_no");
CREATE UNIQUE INDEX "document_versions_storage_key_uq"
    ON "document_versions"("storage_key");
CREATE INDEX "document_versions_document_uploaded_at_idx"
    ON "document_versions"("document_id", "uploaded_at");
CREATE INDEX "document_versions_uploader_uploaded_at_idx"
    ON "document_versions"("uploaded_by", "uploaded_at");

-- The target exists now, so the current-version relationship can be enforced.
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_current_version_fkey"
    FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "document_links" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "linked_resource_type" VARCHAR(100) NOT NULL,
    "linked_resource_id" UUID NOT NULL,
    "relation_type" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_links_document_fkey"
        FOREIGN KEY ("document_id") REFERENCES "documents"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "document_links_resource_type_not_blank" CHECK (length(btrim("linked_resource_type")) > 0),
    CONSTRAINT "document_links_relation_type_not_blank" CHECK (length(btrim("relation_type")) > 0)
);

CREATE INDEX "document_links_document_idx"
    ON "document_links"("document_id");
CREATE INDEX "document_links_resource_idx"
    ON "document_links"("linked_resource_type", "linked_resource_id");
