-- AlterTable
ALTER TABLE "products" ADD COLUMN     "availableQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "compareAtPriceMinor" INTEGER,
ADD COLUMN     "priceMinor" INTEGER;

-- CreateIndex
CREATE INDEX "products_status_priceMinor_idx" ON "products"("status", "priceMinor");

-- CreateIndex
CREATE INDEX "products_status_availableQuantity_idx" ON "products"("status", "availableQuantity");

-- ── Hand-written: keep the catalog projection columns in sync ────────────────
-- products."priceMinor" / "compareAtPriceMinor": the default active variant (else the first active one).
-- products."availableQuantity": sum over active variants of max(onHand - reserved, 0).
ALTER TABLE "products"
  ADD CONSTRAINT "products_projection_check" CHECK (
    "availableQuantity" >= 0 AND ("priceMinor" IS NULL OR "priceMinor" >= 0)
  );

CREATE FUNCTION refresh_product_catalog_fields(p_id UUID) RETURNS void
LANGUAGE sql AS $$
  UPDATE products p SET
    "priceMinor" = d."priceMinor",
    "compareAtPriceMinor" = d."compareAtPriceMinor",
    "availableQuantity" = coalesce((
      SELECT sum(greatest(i."onHand" - i.reserved, 0))
      FROM product_variants v JOIN inventory i ON i."variantId" = v.id
      WHERE v."productId" = p_id AND v."isActive"
    ), 0)
  FROM (
    SELECT
      (SELECT v."priceMinor" FROM product_variants v
        WHERE v."productId" = p_id AND v."isActive"
        ORDER BY v."isDefault" DESC, v."sortOrder" ASC, v."createdAt" ASC LIMIT 1) AS "priceMinor",
      (SELECT v."compareAtPriceMinor" FROM product_variants v
        WHERE v."productId" = p_id AND v."isActive"
        ORDER BY v."isDefault" DESC, v."sortOrder" ASC, v."createdAt" ASC LIMIT 1) AS "compareAtPriceMinor"
  ) d
  WHERE p.id = p_id;
$$;

CREATE FUNCTION product_variants_catalog_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM refresh_product_catalog_fields(OLD."productId");
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW."productId" IS DISTINCT FROM OLD."productId") THEN
    PERFORM refresh_product_catalog_fields(NEW."productId");
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER product_variants_catalog
  AFTER INSERT OR DELETE OR UPDATE OF "priceMinor", "compareAtPriceMinor", "isActive", "isDefault", "sortOrder", "productId"
  ON "product_variants"
  FOR EACH ROW EXECUTE FUNCTION product_variants_catalog_trigger();

CREATE FUNCTION inventory_catalog_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  affected UUID;
BEGIN
  SELECT v."productId" INTO affected FROM product_variants v
   WHERE v.id = CASE WHEN TG_OP = 'DELETE' THEN OLD."variantId" ELSE NEW."variantId" END;
  IF affected IS NOT NULL THEN
    PERFORM refresh_product_catalog_fields(affected);
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER inventory_catalog
  AFTER INSERT OR DELETE OR UPDATE OF "onHand", "reserved" ON "inventory"
  FOR EACH ROW EXECUTE FUNCTION inventory_catalog_trigger();

-- Backfill existing products.
SELECT refresh_product_catalog_fields(id) FROM products;
