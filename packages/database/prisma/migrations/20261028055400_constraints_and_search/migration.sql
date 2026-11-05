-- Hand-written: integrity rules Prisma cannot express in schema.prisma.
-- Prisma does not manage CHECK constraints or triggers, so later generated migrations leave these intact.
-- Keep prisma/README.md in sync when adding to this list.

-- ── Identity ────────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD CONSTRAINT "users_failed_login_count_check" CHECK ("failedLoginCount" >= 0);

-- ── Catalog ─────────────────────────────────────────────────────────────────
ALTER TABLE "products"
  ADD CONSTRAINT "products_warranty_months_check" CHECK ("warrantyMonths" >= 0),
  ADD CONSTRAINT "products_rating_avg_check" CHECK ("ratingAvg" >= 0 AND "ratingAvg" <= 5),
  ADD CONSTRAINT "products_rating_count_check" CHECK ("ratingCount" >= 0),
  ADD CONSTRAINT "products_sales_count_check" CHECK ("salesCount" >= 0),
  ADD CONSTRAINT "products_published_at_check" CHECK (status <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_price_check" CHECK ("priceMinor" >= 0),
  ADD CONSTRAINT "product_variants_compare_at_check" CHECK ("compareAtPriceMinor" IS NULL OR "compareAtPriceMinor" > "priceMinor"),
  ADD CONSTRAINT "product_variants_cost_check" CHECK ("costMinor" IS NULL OR "costMinor" >= 0),
  ADD CONSTRAINT "product_variants_weight_check" CHECK ("weightGrams" IS NULL OR "weightGrams" > 0);

-- ── Inventory: the last line of defence against overselling ─────────────────
ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_on_hand_check" CHECK ("onHand" >= 0),
  ADD CONSTRAINT "inventory_reserved_check" CHECK ("reserved" >= 0 AND "reserved" <= "onHand"),
  ADD CONSTRAINT "inventory_low_stock_threshold_check" CHECK ("lowStockThreshold" >= 0);

ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_delta_check" CHECK ("delta" <> 0),
  ADD CONSTRAINT "inventory_movements_after_check" CHECK ("onHandAfter" >= 0 AND "reservedAfter" >= 0);

-- ── Shopping ────────────────────────────────────────────────────────────────
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 99);

-- ── Orders: totals must add up ──────────────────────────────────────────────
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_non_negative_check" CHECK (
    "subtotalMinor" >= 0 AND "discountMinor" >= 0 AND "shippingMinor" >= 0
    AND "taxMinor" >= 0 AND "totalMinor" >= 0
  ),
  ADD CONSTRAINT "orders_discount_check" CHECK ("discountMinor" <= "subtotalMinor"),
  -- Totals are rounded up to whole shillings for M-Pesa, so rounding is 0..99 cents.
  ADD CONSTRAINT "orders_rounding_check" CHECK ("roundingMinor" BETWEEN 0 AND 99),
  ADD CONSTRAINT "orders_total_check" CHECK (
    "totalMinor" = "subtotalMinor" - "discountMinor" + "shippingMinor" + "roundingMinor"
  ),
  ADD CONSTRAINT "orders_tax_check" CHECK ("taxMinor" <= "totalMinor"),
  ADD CONSTRAINT "orders_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_amounts_check" CHECK (
    "unitPriceMinor" >= 0 AND "discountMinor" >= 0 AND "taxMinor" >= 0
  ),
  ADD CONSTRAINT "order_items_tax_rate_check" CHECK ("taxRateBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "order_items_line_total_check" CHECK (
    "lineTotalMinor" = "unitPriceMinor" * "quantity" - "discountMinor" AND "lineTotalMinor" >= 0
  ),
  ADD CONSTRAINT "order_items_tax_check" CHECK ("taxMinor" <= "lineTotalMinor");

-- ── Payments ────────────────────────────────────────────────────────────────
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_check" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "payments_refunded_check" CHECK ("refundedMinor" >= 0 AND "refundedMinor" <= "amountMinor"),
  ADD CONSTRAINT "payments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_amount_check" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "payment_attempts_query_count_check" CHECK ("queryCount" >= 0);

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_check" CHECK ("amountMinor" > 0);

-- ── Shipping ────────────────────────────────────────────────────────────────
ALTER TABLE "shipping_rates"
  ADD CONSTRAINT "shipping_rates_price_check" CHECK ("priceMinor" >= 0),
  ADD CONSTRAINT "shipping_rates_free_above_check" CHECK ("freeAboveMinor" IS NULL OR "freeAboveMinor" > 0),
  ADD CONSTRAINT "shipping_rates_eta_check" CHECK ("etaMinDays" >= 0 AND "etaMinDays" <= "etaMaxDays");

-- ── Marketing ───────────────────────────────────────────────────────────────
ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_value_check" CHECK (
    ("type" = 'PERCENTAGE' AND "percentBps" BETWEEN 1 AND 10000 AND "amountMinor" IS NULL)
    OR ("type" = 'FIXED_AMOUNT' AND "amountMinor" > 0 AND "percentBps" IS NULL)
  ),
  ADD CONSTRAINT "coupons_limits_check" CHECK (
    "minOrderMinor" >= 0 AND "redemptionCount" >= 0
    AND ("maxRedemptions" IS NULL OR "maxRedemptions" > 0)
    AND ("maxPerCustomer" IS NULL OR "maxPerCustomer" > 0)
    AND ("maxDiscountMinor" IS NULL OR "maxDiscountMinor" > 0)
  ),
  ADD CONSTRAINT "coupons_window_check" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_discount_check" CHECK ("discountMinor" >= 0);

ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5);

-- ── Content ─────────────────────────────────────────────────────────────────
ALTER TABLE "banners" ADD CONSTRAINT "banners_window_check" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "blog_posts"
  ADD CONSTRAINT "blog_posts_published_at_check" CHECK ("status" NOT IN ('PUBLISHED', 'SCHEDULED') OR "publishedAt" IS NOT NULL),
  ADD CONSTRAINT "blog_posts_reading_minutes_check" CHECK ("readingMinutes" IS NULL OR "readingMinutes" > 0);

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_bytes_check" CHECK ("bytes" > 0);

-- ── Product search vector ───────────────────────────────────────────────────
-- Weights: A = product and brand name, B = short description and specification values, C = description.
-- Names use the 'simple' configuration (no stemming: "M3", "RTX 4060" stay intact); prose uses 'english'.
CREATE FUNCTION product_search_document(
  p_id UUID, p_name TEXT, p_short TEXT, p_description TEXT, p_brand_id UUID
) RETURNS tsvector
LANGUAGE sql STABLE AS $$
  SELECT
    setweight(to_tsvector('simple', unaccent(coalesce(p_name, ''))), 'A')
    || setweight(to_tsvector('simple', unaccent(coalesce((SELECT b.name FROM brands b WHERE b.id = p_brand_id), ''))), 'A')
    || setweight(to_tsvector('english', unaccent(coalesce(p_short, ''))), 'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(
         (SELECT string_agg(s.value, ' ') FROM product_specifications s WHERE s."productId" = p_id), ''))), 'B')
    -- Strip HTML tags from the sanitized description before indexing.
    || setweight(to_tsvector('english', unaccent(regexp_replace(coalesce(p_description, ''), '<[^>]*>', ' ', 'g'))), 'C')
$$;

CREATE FUNCTION products_search_vector_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := product_search_document(NEW.id, NEW.name, NEW."shortDescription", NEW.description, NEW."brandId");
  RETURN NEW;
END
$$;

CREATE TRIGGER products_search_vector
  BEFORE INSERT OR UPDATE OF name, "shortDescription", description, "brandId" ON "products"
  FOR EACH ROW EXECUTE FUNCTION products_search_vector_trigger();

-- Specification changes refresh the parent product's vector.
CREATE FUNCTION product_specifications_search_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  affected UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD."productId" ELSE NEW."productId" END;
BEGIN
  UPDATE products p
     SET "searchVector" = product_search_document(p.id, p.name, p."shortDescription", p.description, p."brandId")
   WHERE p.id = affected;
  RETURN NULL;
END
$$;

CREATE TRIGGER product_specifications_search
  AFTER INSERT OR UPDATE OR DELETE ON "product_specifications"
  FOR EACH ROW EXECUTE FUNCTION product_specifications_search_trigger();

-- Brand renames refresh all of the brand's products.
CREATE FUNCTION brands_search_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products p
     SET "searchVector" = product_search_document(p.id, p.name, p."shortDescription", p.description, p."brandId")
   WHERE p."brandId" = NEW.id;
  RETURN NULL;
END
$$;

CREATE TRIGGER brands_search
  AFTER UPDATE OF name ON "brands"
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION brands_search_trigger();
