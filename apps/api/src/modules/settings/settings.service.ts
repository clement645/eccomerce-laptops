import { Injectable } from '@nestjs/common';
import {
  DEFAULT_VAT_RATE_BPS,
  type PublicStoreSettings,
  type TrustIndicator,
} from '@repo/shared-types';
import { CacheNamespace, CacheService } from '../../infrastructure/cache/cache.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

/** Setting keys that may be shown publicly. Everything else (e.g. COD rules) stays server-side. */
const PUBLIC_KEYS = [
  'store.profile',
  'store.contact',
  'store.social',
  'announcement.bar',
  'homepage.trustIndicators',
  'homepage.whyChooseUs',
  'tax.vat',
] as const;

type SettingValue = Record<string, unknown> | unknown[] | null;

export interface CheckoutSettings {
  vatRateBps: number;
  /** Minutes stock is held while an M-Pesa payment is pending. */
  holdMinutes: number;
  cashOnDelivery: { enabled: boolean; maxOrderMinor: number; counties: string[] };
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  getPublic(): Promise<PublicStoreSettings> {
    return this.cache.getOrSet(CacheNamespace.settings, 'public', () => this.loadPublic());
  }

  /** Server-side checkout rules (not public). */
  getCheckoutSettings(): Promise<CheckoutSettings> {
    return this.cache.getOrSet(CacheNamespace.settings, 'checkout', async () => {
      const rows = await this.prisma.client.storeSetting.findMany({
        where: { key: { in: ['tax.vat', 'checkout.reservation', 'checkout.cashOnDelivery'] } },
      });
      const byKey = new Map(
        rows.map((row) => [row.key, row.value as Record<string, unknown> | null]),
      );
      const vat = byKey.get('tax.vat');
      const reservation = byKey.get('checkout.reservation');
      const cod = byKey.get('checkout.cashOnDelivery');
      return {
        vatRateBps: typeof vat?.rateBps === 'number' ? vat.rateBps : DEFAULT_VAT_RATE_BPS,
        holdMinutes:
          typeof reservation?.holdMinutes === 'number'
            ? Math.min(Math.max(reservation.holdMinutes, 5), 60)
            : 15,
        cashOnDelivery: {
          enabled: cod?.enabled === true,
          maxOrderMinor: typeof cod?.maxOrderMinor === 'number' ? cod.maxOrderMinor : 0,
          counties: Array.isArray(cod?.counties)
            ? (cod.counties as unknown[]).filter((c): c is string => typeof c === 'string')
            : [],
        },
      };
    });
  }

  /** Call after any store setting changes (admin settings module, Phase 9). */
  async invalidate(): Promise<void> {
    // Storefront layout/homepage responses embed settings, so refresh them too.
    await Promise.all([
      this.cache.invalidateNamespace(CacheNamespace.settings),
      this.cache.invalidateNamespace(CacheNamespace.homepage),
    ]);
  }

  private async loadPublic(): Promise<PublicStoreSettings> {
    const rows = await this.prisma.client.storeSetting.findMany({
      where: { key: { in: [...PUBLIC_KEYS] } },
      select: { key: true, value: true },
    });
    const byKey = new Map(rows.map((row) => [row.key, row.value as SettingValue]));
    const vat = byKey.get('tax.vat') as { pricesIncludeVat?: boolean } | null | undefined;

    return {
      profile: (byKey.get('store.profile') as PublicStoreSettings['profile']) ?? null,
      contact: (byKey.get('store.contact') as PublicStoreSettings['contact']) ?? null,
      social: (byKey.get('store.social') as PublicStoreSettings['social']) ?? null,
      announcement: (byKey.get('announcement.bar') as PublicStoreSettings['announcement']) ?? null,
      trustIndicators: (byKey.get('homepage.trustIndicators') as TrustIndicator[] | null) ?? [],
      whyChooseUs: (byKey.get('homepage.whyChooseUs') as TrustIndicator[] | null) ?? [],
      pricesIncludeVat: vat?.pricesIncludeVat ?? true,
    };
  }
}
