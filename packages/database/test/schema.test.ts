import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, resolveDatabase } from '../src/index.ts';

const prisma = createPrismaClient({
  connectionString: resolveDatabase({ ...process.env, DB_TARGET: 'test' }).url,
  maxConnections: 10,
});

const run = `t${Date.now()}`;
let variantId: string;
let productId: string;

beforeAll(async () => {
  const brand = await prisma.brand.create({ data: { slug: `${run}-brand`, name: `${run} Brand` } });
  const category = await prisma.category.create({ data: { slug: `${run}-cat`, name: 'Test' } });
  const product = await prisma.product.create({
    data: {
      slug: `${run}-laptop`,
      name: 'Zephyrus Test Laptop',
      shortDescription: 'Lightweight machine',
      brandId: brand.id,
      categoryId: category.id,
      variants: {
        create: { sku: `${run}-SKU`, name: 'Default', priceMinor: 10_000_000, isDefault: true },
      },
    },
    include: { variants: true },
  });
  productId = product.id;
  variantId = product.variants[0]!.id;
  await prisma.inventory.create({ data: { variantId, onHand: 5 } });
});

afterAll(async () => {
  await prisma.inventory.deleteMany({ where: { variantId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.brand.deleteMany({ where: { slug: `${run}-brand` } });
  await prisma.category.deleteMany({ where: { slug: `${run}-cat` } });
  await prisma.$disconnect();
});

describe('inventory reservation (ADR 0004)', () => {
  it('never oversells under concurrent checkouts', async () => {
    // 20 customers race for 5 units, each reserving with one conditional atomic update.
    const attempts = await Promise.all(
      Array.from(
        { length: 20 },
        () =>
          prisma.$executeRaw`
          UPDATE inventory SET reserved = reserved + 1
          WHERE "variantId" = ${variantId}::uuid AND "onHand" - reserved >= 1`,
      ),
    );
    expect(attempts.filter((rows) => rows === 1)).toHaveLength(5);
    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory).toMatchObject({ onHand: 5, reserved: 5 });
  });

  it('rejects reserved > onHand even if application logic is wrong', async () => {
    await expect(
      prisma.inventory.update({ where: { variantId }, data: { reserved: 6 } }),
    ).rejects.toThrow(/inventory_reserved_check/);
  });

  it('rejects negative stock', async () => {
    await expect(
      prisma.inventory.update({ where: { variantId }, data: { onHand: -1 } }),
    ).rejects.toThrow(/inventory_on_hand_check|inventory_reserved_check/);
  });
});

describe('money integrity', () => {
  it('rejects a compare-at price that is not higher than the price', async () => {
    await expect(
      prisma.productVariant.update({
        where: { id: variantId },
        data: { compareAtPriceMinor: 10_000_000 },
      }),
    ).rejects.toThrow(/product_variants_compare_at_check/);
  });

  it('rejects an order whose total does not add up', async () => {
    await expect(
      prisma.order.create({
        data: {
          orderNumber: `${run}-1`,
          trackingToken: `${run}-tok`,
          email: 'test@example.com',
          phone: '254712345678',
          customerName: 'Test',
          shippingAddress: {},
          subtotalMinor: 10_000,
          shippingMinor: 500,
          totalMinor: 9_999,
        },
      }),
    ).rejects.toThrow(/orders_total_check/);
  });
});

describe('product search vector', () => {
  it('indexes name, brand and specification values, kept fresh by triggers', async () => {
    const find = (term: string) =>
      prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM products WHERE id = ${productId}::uuid
        AND "searchVector" @@ websearch_to_tsquery('simple', ${term})`;

    expect(await find('zephyrus')).toHaveLength(1);
    expect(await find(`${run}`)).toHaveLength(1); // brand name

    await prisma.productSpecification.create({
      data: { productId, group: 'Graphics', key: 'GPU', value: 'Quantumforce' },
    });
    expect(await find('quantumforce')).toHaveLength(1);

    await prisma.productSpecification.deleteMany({ where: { productId } });
    expect(await find('quantumforce')).toHaveLength(0);
  });
});

describe('catalog projection triggers', () => {
  const projection = () =>
    prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { priceMinor: true, compareAtPriceMinor: true, availableQuantity: true },
    });

  it('tracks the default variant price and sellable stock', async () => {
    // Earlier tests reserved all 5 units; release them for this scenario.
    await prisma.inventory.update({ where: { variantId }, data: { reserved: 0 } });
    expect(await projection()).toMatchObject({ priceMinor: 10_000_000, availableQuantity: 5 });

    await prisma.productVariant.update({
      where: { id: variantId },
      data: { priceMinor: 9_000_000, compareAtPriceMinor: 10_000_000 },
    });
    await prisma.inventory.update({ where: { variantId }, data: { reserved: 2 } });
    expect(await projection()).toEqual({
      priceMinor: 9_000_000,
      compareAtPriceMinor: 10_000_000,
      availableQuantity: 3,
    });
  });

  it('sums stock across active variants and ignores inactive ones', async () => {
    const extra = await prisma.productVariant.create({
      data: {
        productId,
        sku: `${run}-SKU-2`,
        name: 'Second',
        priceMinor: 12_000_000,
        sortOrder: 1,
      },
    });
    await prisma.inventory.create({ data: { variantId: extra.id, onHand: 4 } });
    expect((await projection()).availableQuantity).toBe(7);

    await prisma.productVariant.update({ where: { id: extra.id }, data: { isActive: false } });
    expect((await projection()).availableQuantity).toBe(3);

    await prisma.inventory.delete({ where: { variantId: extra.id } });
    await prisma.productVariant.delete({ where: { id: extra.id } });
    expect(await projection()).toMatchObject({ priceMinor: 9_000_000, availableQuantity: 3 });
  });
});
