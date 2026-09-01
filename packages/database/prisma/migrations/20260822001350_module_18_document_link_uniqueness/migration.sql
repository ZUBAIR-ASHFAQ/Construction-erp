-- Pass 86 / Stage 2: make generic document/resource links retry-safe.
-- A document can have one link for the same resource and relation type.
CREATE UNIQUE INDEX "document_links_document_resource_relation_uq"
    ON "document_links"("document_id", "linked_resource_type", "linked_resource_id", "relation_type");
