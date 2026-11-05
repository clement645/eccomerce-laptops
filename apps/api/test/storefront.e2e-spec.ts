import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ProductCard, StorefrontHomepage } from '@repo/shared-types';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { StorefrontService } from '../src/modules/storefront/storefront.service.js';
import { createTestApp } from './support/test-app.js';

const run = `sf${Date.now()}`;

describe('Storefront API (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService['client'];
  let home: StorefrontHomepage;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService).client;
    const brand = await prisma.brand.create({
      data: { slug: `${run}-brand`, name: `${run} Brand` },
    });
    const category = await prisma.category.create({
      data: { slug: `${run}-laptops`, name: 'Test Laptops', showOnHomepage: true },
    });
    const publishedAt = new Date(Date.now() - 2 * 86_400_000);

    // On sale, low stock, two variants with different prices.
    await prisma.product.create({
      data: {
        slug: `${run}-sale`,
        name: 'Sale Laptop',
        status: 'PUBLISHED',
        publishedAt,
        isFeatured: true,
        brandId: brand.id,
        categoryId: category.id,
        variants: {
          create: [
            {
              sku: `${run}-SALE-1`,
              name: 'Base',
              priceMinor: 8_000_000,
              compareAtPriceMinor: 10_000_000,
              isDefault: true,
              inventory: { create: { onHand: 3, reserved: 1, lowStockThreshold: 5 } },
            },
            {
              sku: `${run}-SALE-2`,
              name: 'Max',
              priceMinor: 9_000_000,
              sortOrder: 1,
              inventory: { create: { onHand: 0 } },
            },
          ],
        },
      },
    });
    // Out of stock.
    await prisma.product.create({
      data: {
        slug: `${run}-oos`,
        name: 'Sold Out Laptop',
        status: 'PUBLISHED',
        publishedAt,
        brandId: brand.id,
        categoryId: category.id,
        variants: {
          create: {
            sku: `${run}-OOS`,
            name: 'Only',
            priceMinor: 5_000_000,
            isDefault: true,
            inventory: { create: { onHand: 2, reserved: 2 } },
          },
        },
      },
    });
    // Draft: must never appear.
    await prisma.product.create({
      data: {
        slug: `${run}-draft`,
        name: 'Draft Laptop',
        status: 'DRAFT',
        brandId: brand.id,
        categoryId: category.id,
        variants: {
          create: { sku: `${run}-DRAFT`, name: 'Only', priceMinor: 1_000_000, isDefault: true },
        },
      },
    });

    await prisma.homepageSection.createMany({
      data: [
        {
          key: `${run}-best`,
          title: 'Best Selling Products',
          config: { source: 'best_sellers' },
          sortOrder: 1,
        },
        {
          key: `${run}-sale`,
          title: 'Special Offers',
          config: { source: 'on_sale' },
          sortOrder: 2,
        },
        {
          key: `${run}-cat`,
          title: 'Category picks',
          config: { source: 'category', categorySlug: `${run}-laptops` },
          sortOrder: 3,
        },
      ],
    });
    await prisma.banner.create({
      data: {
        placement: 'HERO',
        title: `${run} Hero`,
        titleHighlight: 'Hero',
        highlights: ['A', 'B'],
      },
    });
    await prisma.banner.create({
      data: { placement: 'HERO', title: `${run} Expired`, endsAt: new Date(Date.now() - 1000) },
    });

    await app.get(StorefrontService).invalidate();
    home = (await request(app.getHttpServer()).get('/api/v1/storefront/homepage').expect(200)).body;
  });

  afterAll(async () => {
    await prisma.homepageSection.deleteMany({ where: { key: { startsWith: run } } });
    await prisma.banner.deleteMany({ where: { title: { startsWith: run } } });
    await prisma.inventory.deleteMany({ where: { variant: { sku: { startsWith: run } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: run } } });
    await prisma.brand.deleteMany({ where: { slug: `${run}-brand` } });
    await prisma.category.deleteMany({ where: { slug: `${run}-laptops` } });
    await app.close();
  });

  const allCards = (): ProductCard[] => home.sections.flatMap((s) => s.products);
  const card = (slug: string) => allCards().find((p) => p.slug === `${run}-${slug}`);

  it('maps price, discount, price range and stock from the default variant', () => {
    expect(card('sale')).toMatchObject({
      priceMinor: 8_000_000,
      compareAtPriceMinor: 10_000_000,
      discountPercent: 20,
      hasPriceRange: true,
      stockStatus: 'LOW_STOCK',
      isNew: true,
    });
    expect(card('oos')?.stockStatus).toBe('OUT_OF_STOCK');
  });

  it('never fabricates ratings', () => {
    for (const product of allCards()) expect(product.rating).toBeNull();
    expect(home.stats.reviews).toBeNull();
  });

  it('hides best sellers until something has actually sold', () => {
    expect(home.sections.find((s) => s.key === `${run}-best`)).toBeUndefined();
  });

  it('builds sections from their configured source and links them', () => {
    const sale = home.sections.find((s) => s.key === `${run}-sale`);
    expect(sale?.products.map((p) => p.slug)).toEqual([`${run}-sale`]);
    expect(sale?.href).toBe('/deals');
    const category = home.sections.find((s) => s.key === `${run}-cat`);
    expect(category?.href).toBe(`/category/${run}-laptops`);
  });

  it('excludes drafts everywhere', () => {
    expect(JSON.stringify(home)).not.toContain(`${run}-draft`);
    const cat = home.categories.find((c) => c.slug === `${run}-laptops`);
    expect(cat?.productCount).toBe(2);
  });

  it('returns only banners inside their schedule, with presentation fields', () => {
    const titles = home.heroBanners.map((b) => b.title);
    expect(titles).toContain(`${run} Hero`);
    expect(titles).not.toContain(`${run} Expired`);
    expect(home.heroBanners.find((b) => b.title === `${run} Hero`)).toMatchObject({
      titleHighlight: 'Hero',
      highlights: ['A', 'B'],
      image: null,
    });
  });

  it('reports real store stats', () => {
    expect(home.stats.productCount).toBeGreaterThanOrEqual(2);
    expect(home.stats.brandCount).toBeGreaterThanOrEqual(1);
  });

  it('serves the layout with navigation and public settings', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/storefront/layout').expect(200);
    expect(res.body.categories.map((c: { slug: string }) => c.slug)).toContain(`${run}-laptops`);
    expect(res.body.settings).toHaveProperty('whyChooseUs');
    expect(res.headers['cache-control']).toContain('stale-while-revalidate');
  });
});
