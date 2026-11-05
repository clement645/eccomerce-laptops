import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ProductDetail, ProductListResponse } from '@repo/shared-types';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { CatalogService } from '../src/modules/catalog/catalog.service.js';
import { createTestApp } from './support/test-app.js';

const run = `cat${Date.now()}`;
const brandA = `${run}-acme`;
const brandB = `${run}-globex`;
const parentCategory = `${run}-computers`;
const childCategory = `${run}-ultrabooks`;

interface ReceivedRevalidation {
  headers: IncomingHttpHeaders;
  body: { tags: string[] };
}

describe('Catalog API (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService['client'];
  let revalidationServer: Server;
  const received: ReceivedRevalidation[] = [];
  const secret = 'r'.repeat(40);

  const list = async (query: Record<string, string | string[]>): Promise<ProductListResponse> =>
    (await request(app.getHttpServer()).get('/api/v1/catalog/products').query(query).expect(200))
      .body;
  const slugs = (res: ProductListResponse) => res.items.map((p) => p.slug.replace(`${run}-`, ''));

  beforeAll(async () => {
    // Stand-in storefront that records revalidation calls.
    revalidationServer = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received.push({ headers: req.headers, body: JSON.parse(body) as { tags: string[] } });
        res.writeHead(200).end('{}');
      });
    });
    await new Promise<void>((resolve) => revalidationServer.listen(0, '127.0.0.1', resolve));
    const port = (revalidationServer.address() as AddressInfo).port;

    app = await createTestApp({
      STOREFRONT_REVALIDATE_URL: `http://127.0.0.1:${port}/api/revalidate`,
      REVALIDATE_SECRET: secret,
    });
    prisma = app.get(PrismaService).client;

    const acme = await prisma.brand.create({ data: { slug: brandA, name: `Acme ${run}` } });
    const globex = await prisma.brand.create({ data: { slug: brandB, name: `Globex ${run}` } });
    const parent = await prisma.category.create({
      data: { slug: parentCategory, name: 'Computers' },
    });
    const child = await prisma.category.create({
      data: { slug: childCategory, name: 'Ultrabooks', parentId: parent.id },
    });

    const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
    const makeProduct = async (input: {
      slug: string;
      name: string;
      brandId: string;
      categoryId: string;
      price: number;
      compareAt?: number;
      stock: number;
      condition?: 'NEW' | 'REFURBISHED';
      publishedDaysAgo: number;
      specs: [string, string][];
      description?: string;
      status?: 'PUBLISHED' | 'DRAFT';
    }) =>
      prisma.product.create({
        data: {
          slug: `${run}-${input.slug}`,
          name: input.name,
          brandId: input.brandId,
          categoryId: input.categoryId,
          condition: input.condition ?? 'NEW',
          status: input.status ?? 'PUBLISHED',
          publishedAt: input.status === 'DRAFT' ? null : daysAgo(input.publishedDaysAgo),
          description: input.description,
          variants: {
            create: {
              sku: `${run}-${input.slug}`,
              name: 'Default',
              isDefault: true,
              priceMinor: input.price * 100,
              compareAtPriceMinor: input.compareAt ? input.compareAt * 100 : null,
              inventory: { create: { onHand: input.stock, lowStockThreshold: 3 } },
            },
          },
          specifications: {
            create: input.specs.map(([key, value], i) => ({
              group: 'Performance',
              key,
              value,
              sortOrder: i,
              isFilterable: true,
            })),
          },
        },
      });

    await makeProduct({
      slug: 'quasar',
      name: `Acme Quasar 14 ${run}`,
      brandId: acme.id,
      categoryId: child.id,
      price: 120_000,
      compareAt: 150_000,
      stock: 20,
      publishedDaysAgo: 1,
      specs: [
        ['RAM', '16GB'],
        ['Graphics', 'Quantumforce X1'],
      ],
      description:
        '<p>Fast <strong>and</strong> light.</p><script>alert(1)</script><p onclick="x()">Safe</p>',
    });
    await makeProduct({
      slug: 'nebulon',
      name: `Acme Nebulon 15 ${run}`,
      brandId: acme.id,
      categoryId: parent.id,
      price: 80_000,
      stock: 0,
      publishedDaysAgo: 5,
      specs: [['RAM', '8GB']],
    });
    await makeProduct({
      slug: 'pulsarix',
      name: `Globex Pulsarix Pro ${run}`,
      brandId: globex.id,
      categoryId: parent.id,
      price: 200_000,
      stock: 4,
      condition: 'REFURBISHED',
      publishedDaysAgo: 10,
      specs: [['RAM', '16GB']],
    });
    await makeProduct({
      slug: 'hidden',
      name: `Acme Hidden Draft ${run}`,
      brandId: acme.id,
      categoryId: parent.id,
      price: 1_000,
      stock: 5,
      publishedDaysAgo: 0,
      specs: [],
      status: 'DRAFT',
    });

    // Reviews: one approved, one pending. Only the approved one may count.
    const quasar = await prisma.product.findUniqueOrThrow({ where: { slug: `${run}-quasar` } });
    const reviewer = await prisma.user.create({
      data: {
        email: `${run}@example.com`,
        profile: { create: { firstName: 'Wanjiku', lastName: 'Mwangi' } },
      },
    });
    const other = await prisma.user.create({ data: { email: `${run}-2@example.com` } });
    await prisma.productReview.create({
      data: {
        productId: quasar.id,
        userId: reviewer.id,
        rating: 4,
        body: 'Great keyboard',
        status: 'APPROVED',
      },
    });
    await prisma.productReview.create({
      data: {
        productId: quasar.id,
        userId: other.id,
        rating: 1,
        body: 'Pending',
        status: 'PENDING',
      },
    });

    await app.get(CatalogService).invalidate();
    received.length = 0;
  });

  afterAll(async () => {
    await prisma.productReview.deleteMany({ where: { product: { slug: { startsWith: run } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
    await prisma.inventory.deleteMany({ where: { variant: { sku: { startsWith: run } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: run } } });
    await prisma.brand.deleteMany({ where: { slug: { in: [brandA, brandB] } } });
    await prisma.category.deleteMany({ where: { slug: childCategory } });
    await prisma.category.deleteMany({ where: { slug: parentCategory } });
    await app.close();
    await new Promise((resolve) => revalidationServer.close(resolve));
  });

  describe('listing', () => {
    it('lists published products newest first and never drafts', async () => {
      const res = await list({ brand: [brandA, brandB] });
      expect(slugs(res)).toEqual(['quasar', 'nebulon', 'pulsarix']);
      expect(res.total).toBe(3);
    });

    it('paginates', async () => {
      const page2 = await list({ brand: [brandA, brandB], pageSize: '2', page: '2' });
      expect(slugs(page2)).toEqual(['pulsarix']);
      expect(page2).toMatchObject({ total: 3, totalPages: 2, page: 2 });
    });

    it('includes subcategories when filtering by a parent category', async () => {
      expect(slugs(await list({ category: parentCategory })).sort()).toEqual([
        'nebulon',
        'pulsarix',
        'quasar',
      ]);
      expect(slugs(await list({ category: childCategory }))).toEqual(['quasar']);
    });

    it('filters by brand, price, stock, sale and condition', async () => {
      const scope = { brand: [brandA, brandB] };
      expect(slugs(await list({ brand: brandB }))).toEqual(['pulsarix']);
      expect(slugs(await list({ ...scope, minPrice: '90000', maxPrice: '150000' }))).toEqual([
        'quasar',
      ]);
      expect(slugs(await list({ ...scope, inStock: 'true' })).sort()).toEqual([
        'pulsarix',
        'quasar',
      ]);
      expect(slugs(await list({ ...scope, onSale: 'true' }))).toEqual(['quasar']);
      expect(slugs(await list({ ...scope, condition: 'REFURBISHED' }))).toEqual(['pulsarix']);
    });

    it('ORs values within a spec and ANDs across specs', async () => {
      const scope = { brand: [brandA, brandB] };
      expect(slugs(await list({ ...scope, spec: ['RAM:8GB', 'RAM:16GB'] })).sort()).toEqual([
        'nebulon',
        'pulsarix',
        'quasar',
      ]);
      expect(
        slugs(await list({ ...scope, spec: ['RAM:16GB', 'Graphics:Quantumforce X1'] })),
      ).toEqual(['quasar']);
    });

    it('sorts by price', async () => {
      const scope = { brand: [brandA, brandB] };
      expect(slugs(await list({ ...scope, sort: 'price_asc' }))).toEqual([
        'nebulon',
        'quasar',
        'pulsarix',
      ]);
      expect(slugs(await list({ ...scope, sort: 'price_desc' }))).toEqual([
        'pulsarix',
        'quasar',
        'nebulon',
      ]);
    });

    it('returns facets for the scope', async () => {
      const { facets } = await list({ category: parentCategory });
      expect(facets.brands.map((b) => [b.value, b.count])).toEqual(
        expect.arrayContaining([
          [brandA, 2],
          [brandB, 1],
        ]),
      );
      expect(
        facets.specs.find((s) => s.key === 'RAM')?.options.map((o) => [o.value, o.count]),
      ).toEqual([
        ['8GB', 1],
        ['16GB', 2],
      ]);
      expect(facets.price).toEqual({ minMinor: 8_000_000, maxMinor: 20_000_000 });
      expect(facets.inStockCount).toBe(2);
      expect(facets.onSaleCount).toBe(1);
    });

    it('validates the query', async () => {
      const bad = await request(app.getHttpServer())
        .get('/api/v1/catalog/products')
        .query({ sort: 'cheapest' })
        .expect(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      await request(app.getHttpServer())
        .get('/api/v1/catalog/products')
        .query({ category: `${run}-nope` })
        .expect(404);
    });
  });

  describe('search', () => {
    it('finds products by name, spec value and partial words', async () => {
      expect(slugs(await list({ q: 'quasar' }))).toEqual(['quasar']);
      expect(slugs(await list({ q: 'quantumforce' }))).toEqual(['quasar']);
      expect(slugs(await list({ q: 'pulsa' }))).toEqual(['pulsarix']);
    });

    it('tolerates typos', async () => {
      expect(slugs(await list({ q: 'pulsarx' }))).toContain('pulsarix');
      expect(slugs(await list({ q: 'nebulin' }))).toContain('nebulon');
    });

    it('combines search with filters and ignores injection attempts', async () => {
      expect(slugs(await list({ q: run, brand: brandB }))).toEqual(['pulsarix']);
      expect((await list({ q: "quasar' OR 1=1; --" })).items.map((p) => p.slug)).toEqual([
        `${run}-quasar`,
      ]);
    });

    it('suggests products and brands', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/catalog/search/suggest')
        .query({ q: 'Globex' })
        .expect(200);
      expect(res.body.products.map((p: { slug: string }) => p.slug)).toContain(`${run}-pulsarix`);
      expect(res.body.brands.map((b: { slug: string }) => b.slug)).toContain(brandB);
      await request(app.getHttpServer())
        .get('/api/v1/catalog/search/suggest')
        .query({ q: 'a' })
        .expect(400);
    });
  });

  describe('product detail', () => {
    let detail: ProductDetail;

    beforeAll(async () => {
      detail = (
        await request(app.getHttpServer()).get(`/api/v1/catalog/products/${run}-quasar`).expect(200)
      ).body;
    });

    it('returns variants with capped purchasable quantity', () => {
      expect(detail.variants).toHaveLength(1);
      expect(detail.variants[0]).toMatchObject({
        priceMinor: 12_000_000,
        discountPercent: 20,
        stockStatus: 'IN_STOCK',
        maxQuantity: 10,
      });
    });

    it('sanitizes the description', () => {
      expect(detail.descriptionHtml).toBe('<p>Fast <strong>and</strong> light.</p><p>Safe</p>');
    });

    it('groups specifications and builds breadcrumbs through the parent', () => {
      expect(detail.specifications).toEqual([
        {
          group: 'Performance',
          items: [
            { key: 'RAM', value: '16GB' },
            { key: 'Graphics', value: 'Quantumforce X1' },
          ],
        },
      ]);
      expect(detail.breadcrumbs.map((b) => b.slug)).toEqual([parentCategory, childCategory]);
    });

    it('counts approved reviews only and protects reviewer identity', () => {
      expect(detail.reviews).toMatchObject({ average: 4, count: 1, distribution: [0, 0, 0, 1, 0] });
      expect(detail.reviews?.items[0]).toMatchObject({
        authorName: 'Wanjiku M.',
        verifiedPurchase: false,
      });
      expect(JSON.stringify(detail)).not.toContain('@example.com');
    });

    it('reports out-of-stock variants as not purchasable', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${run}-nebulon`)
        .expect(200);
      expect(res.body.variants[0]).toMatchObject({ stockStatus: 'OUT_OF_STOCK', maxQuantity: 0 });
      expect(res.body.reviews).toBeNull();
    });

    it('hides drafts and unknown products', async () => {
      await request(app.getHttpServer()).get(`/api/v1/catalog/products/${run}-hidden`).expect(404);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${run}-missing`)
        .expect(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('rejects malformed slugs', async () => {
      await request(app.getHttpServer()).get('/api/v1/catalog/products/Bad%20Slug').expect(400);
    });

    it('lists related products from the same category, then the same brand', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${run}-nebulon/related`)
        .expect(200);
      const related = res.body.map((p: { slug: string }) => p.slug);
      expect(related).toContain(`${run}-pulsarix`);
      expect(related).not.toContain(`${run}-nebulon`);
      expect(related).not.toContain(`${run}-hidden`);
    });
  });

  describe('categories, brands and sitemap', () => {
    it('returns category detail with children', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/catalog/categories/${parentCategory}`)
        .expect(200);
      expect(res.body).toMatchObject({ slug: parentCategory, productCount: 2 });
      expect(res.body.children.map((c: { slug: string }) => c.slug)).toEqual([childCategory]);
    });

    it('returns brand detail and 404 for unknown brands', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/catalog/brands/${brandA}`)
        .expect(200);
      expect(res.body).toMatchObject({ slug: brandA, productCount: 2 });
      await request(app.getHttpServer()).get(`/api/v1/catalog/brands/${run}-nope`).expect(404);
    });

    it('lists only published products in the sitemap', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/catalog/sitemap').expect(200);
      const productSlugs = res.body.products.map((p: { slug: string }) => p.slug);
      expect(productSlugs).toContain(`${run}-quasar`);
      expect(productSlugs).not.toContain(`${run}-hidden`);
    });
  });

  describe('cache invalidation', () => {
    it('serves fresh data after invalidation and notifies the storefront with the secret', async () => {
      await list({ brand: brandA });
      await prisma.product.update({
        where: { slug: `${run}-nebulon` },
        data: { name: `Acme Nebulon Renamed ${run}` },
      });
      expect((await list({ brand: brandA })).items.some((p) => p.name.includes('Renamed'))).toBe(
        false,
      );

      await app.get(CatalogService).invalidate([`${run}-nebulon`]);
      expect((await list({ brand: brandA })).items.some((p) => p.name.includes('Renamed'))).toBe(
        true,
      );

      expect(received).toHaveLength(1);
      expect(received[0]!.headers['x-revalidate-secret']).toBe(secret);
      expect(received[0]!.body.tags).toEqual(
        expect.arrayContaining([
          'catalog',
          'storefront-homepage',
          'storefront-layout',
          `product:${run}-nebulon`,
        ]),
      );
    });
  });
});
