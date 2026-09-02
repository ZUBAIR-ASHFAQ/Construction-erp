-- Repair Procurement item Company-scope triggers after Final-21 activated the consolidated material master.
-- Both creation paths share these functions, so requisition and Purchase Order lines remain fail-closed.
CREATE OR REPLACE FUNCTION "module_10_validate_requisition_item_company_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    requisition_company_id UUID;
    material_company_id UUID;
BEGIN
    IF NEW."item_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT requisition."company_id", material."company_id"
      INTO requisition_company_id, material_company_id
      FROM "purchase_requisitions" requisition
      CROSS JOIN "materials" material
     WHERE requisition."id" = NEW."requisition_id"
       AND material."id" = NEW."item_id";

    IF requisition_company_id IS DISTINCT FROM material_company_id THEN
        RAISE EXCEPTION 'Purchase requisition material must belong to the requisition Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "module_10_validate_purchase_order_item_company_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    purchase_order_company_id UUID;
    material_company_id UUID;
BEGIN
    IF NEW."item_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT purchase_order."company_id", material."company_id"
      INTO purchase_order_company_id, material_company_id
      FROM "purchase_orders" purchase_order
      CROSS JOIN "materials" material
     WHERE purchase_order."id" = NEW."purchase_order_id"
       AND material."id" = NEW."item_id";

    IF purchase_order_company_id IS DISTINCT FROM material_company_id THEN
        RAISE EXCEPTION 'Purchase Order material must belong to the PO Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;
