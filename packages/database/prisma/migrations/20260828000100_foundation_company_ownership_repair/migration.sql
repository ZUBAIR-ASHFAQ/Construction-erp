-- Final 21-module Foundation repair: every explicit company_id must resolve directly to companies.id.
-- Inventory count lines already have same-company parent/item constraints, so this adds the missing direct Company FK only.
ALTER TABLE "inventory_count_lines"
  ADD CONSTRAINT "inventory_count_lines_company_fk"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
