/**
 * Idempotent development seed: safe to run repeatedly. Existing stock levels are never overwritten.
 *
 *   pnpm --filter @repo/database seed          # Neon (DIRECT_DATABASE_URL)
 *   pnpm --filter @repo/database seed:local    # local Docker database
 */
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, shillingsToMinor } from '@repo/shared-types';
import {
  createPrismaClient,
  describeDatabaseUrl,
  resolveDatabase,
  type PrismaClient,
} from '../../src/index.ts';
import { blogCategories, blogPosts } from './data/blog.ts';
import { brands, categories, products } from './data/catalog.ts';
import { banners, homepageSections, storeSettings } from './data/content.ts';
import { shippingMethods, shippingRates } from './data/shipping.ts';

const ROLE_NAMES: Record<keyof typeof DEFAULT_ROLE_PERMISSIONS, [string, string]> = {
  SUPER_ADMIN: ['Super Administrator', 'Full access, including staff and role management.'],
  STORE_MANAGER: ['Store Manager', 'Runs day-to-day store operations.'],
  INVENTORY_MANAGER: ['Inventory Manager', 'Manages stock levels and adjustments.'],
  SALES_MANAGER: ['Sales Manager', 'Manages orders, customers and promotions.'],
  CUSTOMER_SUPPORT: ['Customer Support', 'Helps customers with orders and reviews.'],
  CONTENT_EDITOR: ['Content Editor', 'Manages homepage content and the blog.'],
};

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

/**
 * Demo products and blog posts make development realistic, but must never appear in a live store:
 * production seeds run with SEED_DEMO=false and get only roles, categories, brands, delivery rates,
 * settings, banners and homepage sections.
 */
const INCLUDE_DEMO = process.env.SEED_DEMO !== 'false';

/** Generous limits: each product is many round trips, and a remote database may be far away. */
const SEED_TX = { maxWait: 10_000, timeout: 120_000 } as const;

async function seedAccessControl(prisma: PrismaClient) {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
  }
  const permissionIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, key: true } })).map((p) => [
      p.key,
      p.id,
    ]),
  );

  for (const [key, granted] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const [name, description] = ROLE_NAMES[key as keyof typeof ROLE_NAMES];
    const role = await prisma.adminRole.upsert({
      where: { key },
      create: { key, name, description, isSystem: true },
      update: { name, description, isSystem: true },
    });
    const wanted = granted.map((permission) => permissionIds.get(permission)!);
    // System roles are reset to their defaults on every seed.
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: wanted } },
      }),
      prisma.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }
  return { permissions: PERMISSIONS.length, roles: Object.keys(DEFAULT_ROLE_PERMISSIONS).length };
}

async function seedCatalog(prisma: PrismaClient) {
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: { ...c, showOnHomepage: true },
      update: { name: c.name, description: c.description, sortOrder: c.sortOrder },
    });
  }
  for (const [index, b] of brands.entries()) {
    await prisma.brand.upsert({
      where: { slug: b.slug },
      create: { ...b, sortOrder: index + 1 },
      update: { name: b.name, website: b.website, isFeatured: b.isFeatured },
    });
  }

  let variantCount = 0;
  for (const p of INCLUDE_DEMO ? products : []) {
    await prisma.$transaction(async (tx) => {
      const fields = {
        name: p.name,
        condition: p.condition ?? 'NEW',
        shortDescription: p.shortDescription,
        description: p.description,
        warrantyMonths: p.warrantyMonths,
        warrantyText: p.warrantyText,
        isFeatured: p.isFeatured ?? false,
        brand: { connect: { slug: p.brand } },
        category: { connect: { slug: p.category } },
      };
      const product = await tx.product.upsert({
        where: { slug: p.slug },
        create: {
          slug: p.slug,
          status: 'PUBLISHED',
          publishedAt: daysAgo(p.publishedDaysAgo),
          ...fields,
        },
        update: fields,
      });

      for (const [sortOrder, [group, key, value, isFilterable]] of p.specs.entries()) {
        await tx.productSpecification.upsert({
          where: { productId_key: { productId: product.id, key } },
          create: {
            productId: product.id,
            group,
            key,
            value,
            sortOrder,
            isFilterable: isFilterable ?? false,
          },
          update: { group, value, sortOrder, isFilterable: isFilterable ?? false },
        });
      }

      for (const [sortOrder, v] of p.variants.entries()) {
        const variantFields = {
          name: v.name,
          priceMinor: shillingsToMinor(v.price),
          compareAtPriceMinor: v.compareAt ? shillingsToMinor(v.compareAt) : null,
          attributes: v.attributes ?? {},
          isDefault: sortOrder === 0,
          sortOrder,
        };
        const variant = await tx.productVariant.upsert({
          where: { sku: v.sku },
          create: { sku: v.sku, productId: product.id, ...variantFields },
          update: variantFields,
        });

        // Stock is only set when the variant is first created; re-seeding never resets live stock.
        const existing = await tx.inventory.findUnique({ where: { variantId: variant.id } });
        if (!existing) {
          await tx.inventory.create({
            data: {
              variantId: variant.id,
              onHand: v.stock,
              lowStockThreshold: v.lowStockThreshold ?? 5,
            },
          });
          if (v.stock > 0) {
            await tx.inventoryMovement.create({
              data: {
                variantId: variant.id,
                delta: v.stock,
                reason: 'RESTOCK',
                onHandAfter: v.stock,
                reservedAfter: 0,
                note: 'Initial stock (seed)',
              },
            });
          }
        }
        variantCount++;
      }
    }, SEED_TX);
  }
  return {
    categories: categories.length,
    brands: brands.length,
    products: INCLUDE_DEMO ? products.length : 0,
    variants: variantCount,
  };
}

async function seedShipping(prisma: PrismaClient) {
  const methodIds = new Map<string, string>();
  for (const m of shippingMethods) {
    const method = await prisma.shippingMethod.upsert({
      where: { code: m.code },
      create: m,
      update: m,
    });
    methodIds.set(m.code, method.id);
  }
  for (const r of shippingRates) {
    const shippingMethodId = methodIds.get(r.method)!;
    const data = {
      priceMinor: shillingsToMinor(r.price),
      freeAboveMinor: r.freeAbove ? shillingsToMinor(r.freeAbove) : null,
      etaMinDays: r.etaMinDays,
      etaMaxDays: r.etaMaxDays,
    };
    // County-wide rates (town = NULL) are unique per method and county.
    const existing = await prisma.shippingRate.findFirst({
      where: { shippingMethodId, county: r.county, town: null },
    });
    if (existing) await prisma.shippingRate.update({ where: { id: existing.id }, data });
    else
      await prisma.shippingRate.create({ data: { shippingMethodId, county: r.county, ...data } });
  }
  return { methods: shippingMethods.length, rates: shippingRates.length };
}

async function seedContent(prisma: PrismaClient) {
  for (const [key, value] of Object.entries(storeSettings)) {
    // Never overwrite settings an administrator may already have edited.
    await prisma.storeSetting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: {},
    });
  }

  // Development banners are matched by placement + title and kept in sync with the seed file.
  for (const { key: _key, ...banner } of banners) {
    const existing = await prisma.banner.findFirst({
      where: { placement: banner.placement, title: banner.title },
    });
    if (existing) await prisma.banner.update({ where: { id: existing.id }, data: banner });
    else await prisma.banner.create({ data: banner });
  }

  for (const { curatedProductSlugs, ...section } of homepageSections) {
    const saved = await prisma.homepageSection.upsert({
      where: { key: section.key },
      create: section,
      update: {},
    });
    for (const [sortOrder, slug] of (INCLUDE_DEMO ? (curatedProductSlugs ?? []) : []).entries()) {
      const product = await prisma.product.findUniqueOrThrow({
        where: { slug },
        select: { id: true },
      });
      await prisma.homepageSectionItem.upsert({
        where: { sectionId_productId: { sectionId: saved.id, productId: product.id } },
        create: { sectionId: saved.id, productId: product.id, sortOrder },
        update: {},
      });
    }
  }

  for (const c of blogCategories) {
    await prisma.blogCategory.upsert({ where: { slug: c.slug }, create: c, update: c });
  }
  for (const { category, publishedDaysAgo, ...post } of INCLUDE_DEMO ? blogPosts : []) {
    const words = post.contentHtml
      .replace(/<[^>]*>/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length;
    const fields = {
      ...post,
      readingMinutes: Math.max(1, Math.round(words / 200)),
      seoTitle: post.title,
      seoDescription: post.excerpt,
      category: { connect: { slug: category } },
    };
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      create: { ...fields, status: 'PUBLISHED', publishedAt: daysAgo(publishedDaysAgo) },
      update: fields,
    });
  }

  return {
    settings: Object.keys(storeSettings).length,
    banners: banners.length,
    homepageSections: homepageSections.length,
    blogPosts: INCLUDE_DEMO ? blogPosts.length : 0,
  };
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new Error(
      'Refusing to seed with NODE_ENV=production. Set SEED_ALLOW_PRODUCTION=true to override.',
    );
  }
  const database = resolveDatabase();
  console.warn(
    `Seeding ${database.target} database ${describeDatabaseUrl(database.url)}${INCLUDE_DEMO ? ' (with demo products and posts)' : ' (no demo data)'}`,
  );

  const prisma = createPrismaClient({ connectionString: database.url, maxConnections: 2 });
  try {
    const started = Date.now();
    const summary = {
      accessControl: await seedAccessControl(prisma),
      catalog: await seedCatalog(prisma),
      shipping: await seedShipping(prisma),
      content: await seedContent(prisma),
    };
    console.warn(JSON.stringify(summary, null, 2));
    console.warn(`Seed completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
