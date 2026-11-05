import { Injectable } from '@nestjs/common';
import type { ShippingOption } from '@repo/shared-types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { shippingFor } from '../checkout/pricing.js';

/** Delivery options for an address. A town-specific rate overrides the county-wide one. */
@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  async optionsFor(
    county: string,
    town: string | undefined,
    goodsMinor: number,
  ): Promise<ShippingOption[]> {
    const methods = await this.prisma.client.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        rates: {
          where: {
            isActive: true,
            county: { equals: county, mode: 'insensitive' },
            OR: [
              { town: null },
              ...(town ? [{ town: { equals: town.trim(), mode: 'insensitive' as const } }] : []),
            ],
          },
        },
      },
    });
    const options: ShippingOption[] = [];
    for (const method of methods) {
      const rate =
        method.rates.find((r) => r.town !== null) ?? method.rates.find((r) => r.town === null);
      if (!rate) continue;
      options.push({
        code: method.code,
        name: method.name,
        description: method.description,
        priceMinor: shippingFor(
          { priceMinor: rate.priceMinor, freeAboveMinor: rate.freeAboveMinor },
          goodsMinor,
        ),
        basePriceMinor: rate.priceMinor,
        freeAboveMinor: rate.freeAboveMinor,
        etaMinDays: rate.etaMinDays,
        etaMaxDays: rate.etaMaxDays,
        codAllowed: method.codAllowed,
      });
    }
    return options;
  }
}
