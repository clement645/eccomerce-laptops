import { z } from 'zod';
import { slugSchema } from './primitives.js';

export const PRODUCT_SORTS = [
  'relevance',
  'newest',
  'price_asc',
  'price_desc',
  'popular',
  'rating',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;

/** Query strings arrive as a string or an array of strings (repeated keys). Always yield an array. */
const list = <T extends z.ZodType<unknown, string>>(item: T, max: number) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]))
    .transform((values) => values.map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(item).max(max));

const flag = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((value) => value === true || value === 'true' || value === '1' || value === 'on');

/** Whole shillings in the URL (readable); converted to minor units by the API. */
const shillings = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => (value === undefined || value === '' ? undefined : Number(value)))
  .pipe(z.number().int().min(0).max(100_000_000).optional());

/** "Key:Value", e.g. "RAM:16GB". Splits on the first colon, so values may contain colons. */
const specFilter = z
  .string()
  .max(160)
  .refine(
    (value) => value.indexOf(':') > 0 && value.indexOf(':') < value.length - 1,
    'Use Key:Value',
  );

export const productListQuerySchema = z
  .object({
    q: z
      .string()
      .optional()
      .transform((value) => value?.trim().slice(0, 100) || undefined),
    category: slugSchema.optional(),
    brand: list(slugSchema, 20),
    condition: list(z.enum(['NEW', 'REFURBISHED']), 2),
    spec: list(specFilter, 30),
    minPrice: shillings,
    maxPrice: shillings,
    inStock: flag,
    onSale: flag,
    featured: flag,
    sort: z.enum(PRODUCT_SORTS).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(PRODUCT_PAGE_SIZE),
  })
  .transform((query) => ({
    ...query,
    // Relevance only makes sense with a search term; default to newest otherwise.
    sort:
      query.sort === 'relevance' && !query.q
        ? 'newest'
        : (query.sort ?? (query.q ? 'relevance' : 'newest')),
    specs: groupSpecs(query.spec),
  }))
  .refine(
    (query) =>
      query.minPrice === undefined ||
      query.maxPrice === undefined ||
      query.minPrice <= query.maxPrice,
    {
      message: 'Minimum price must not exceed maximum price',
      path: ['minPrice'],
    },
  );

export type ProductListQuery = z.output<typeof productListQuerySchema>;
export type ProductListQueryInput = z.input<typeof productListQuerySchema>;

/** Group "Key:Value" filters by key: values within a key are OR'ed, keys are AND'ed. */
function groupSpecs(filters: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const filter of filters) {
    const index = filter.indexOf(':');
    const key = filter.slice(0, index).trim();
    const value = filter.slice(index + 1).trim();
    const values = (grouped[key] ??= []);
    if (!values.includes(value)) values.push(value);
  }
  return grouped;
}

export const searchSuggestQuerySchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(100),
});
