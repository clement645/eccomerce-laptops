import { KENYA_COUNTIES } from '@repo/shared-types';

/** Development delivery pricing (whole shillings). Adjust in the admin dashboard before launch. */
export const shippingMethods = [
  {
    code: 'STANDARD',
    name: 'Standard delivery',
    description: 'Countrywide delivery by courier.',
    codAllowed: true,
    sortOrder: 1,
    isActive: true,
  },
  {
    code: 'EXPRESS',
    name: 'Express delivery',
    description: 'Same or next business day within Nairobi and nearby towns.',
    codAllowed: true,
    sortOrder: 2,
    isActive: true,
  },
  {
    code: 'PICKUP',
    name: 'Store pickup',
    description: 'Collect from our store. Activate once the store location is configured.',
    codAllowed: true,
    sortOrder: 3,
    isActive: false,
  },
] as const;

const metro = new Set(['Kiambu', 'Machakos', 'Kajiado']);
const regionalHubs = new Set(['Mombasa', 'Kisumu', 'Nakuru', 'Uasin Gishu', 'Nyeri', 'Kilifi']);

export interface SeedRate {
  method: string;
  county: string;
  price: number;
  freeAbove?: number;
  etaMinDays: number;
  etaMaxDays: number;
}

export const shippingRates: SeedRate[] = [
  ...KENYA_COUNTIES.map((county): SeedRate => {
    if (county === 'Nairobi')
      return {
        method: 'STANDARD',
        county,
        price: 300,
        freeAbove: 100_000,
        etaMinDays: 1,
        etaMaxDays: 2,
      };
    if (metro.has(county))
      return {
        method: 'STANDARD',
        county,
        price: 450,
        freeAbove: 100_000,
        etaMinDays: 1,
        etaMaxDays: 3,
      };
    if (regionalHubs.has(county))
      return {
        method: 'STANDARD',
        county,
        price: 600,
        freeAbove: 150_000,
        etaMinDays: 2,
        etaMaxDays: 3,
      };
    return {
      method: 'STANDARD',
      county,
      price: 800,
      freeAbove: 150_000,
      etaMinDays: 2,
      etaMaxDays: 5,
    };
  }),
  { method: 'EXPRESS', county: 'Nairobi', price: 600, etaMinDays: 0, etaMaxDays: 1 },
  { method: 'EXPRESS', county: 'Kiambu', price: 900, etaMinDays: 1, etaMaxDays: 1 },
  { method: 'PICKUP', county: 'Nairobi', price: 0, etaMinDays: 0, etaMaxDays: 1 },
];
