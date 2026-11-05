import Image from 'next/image';
import type { BannerContent } from '@repo/shared-types';
import { DeskScene, GamingRig, HeroLaptop } from '@/components/illustrations/scenes';
import { ButtonLink } from '@/components/ui/button-link';
import { HighlightedText } from '@/components/ui/section-heading';
import { Annotation } from './annotation';

function BannerImage({ banner, fallback }: { banner: BannerContent; fallback: React.ReactNode }) {
  if (!banner.image) return <>{fallback}</>;
  return (
    <Image
      src={banner.image.url}
      alt={banner.image.alt}
      fill
      sizes="(min-width: 768px) 50vw, 100vw"
      className="object-cover"
    />
  );
}

/** "Work Smarter. Play Harder.": dark copy panel beside a desk scene. */
export function SplitPromo({ banner }: { banner: BannerContent }) {
  return (
    <section aria-label={banner.title} className="container-page py-6">
      <div className="grid overflow-hidden rounded-[2rem] bg-navy-950 shadow-card md:grid-cols-[1fr_1.15fr]">
        <div className="bg-hero relative flex flex-col justify-center p-8 text-white md:p-12">
          {banner.eyebrow && (
            <p className="text-sm font-medium text-primary-200">{banner.eyebrow}</p>
          )}
          <h2 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">
            <HighlightedText text={banner.title} highlight={banner.titleHighlight} tone="light" />
          </h2>
          {banner.subtitle && <p className="mt-4 max-w-sm text-white/70">{banner.subtitle}</p>}
          {banner.cta && (
            <ButtonLink href={banner.cta.href} className="mt-7 self-start" arrow>
              {banner.cta.label}
            </ButtonLink>
          )}
        </div>
        <div className="relative min-h-64 md:min-h-80">
          <BannerImage
            banner={banner}
            fallback={
              <DeskScene
                idPrefix={`promo-${banner.id}`}
                className="absolute inset-0 h-full w-full"
              />
            }
          />
          {banner.annotation && (
            <Annotation
              text={banner.annotation}
              arrow="down-right"
              className="absolute right-6 top-6 w-40 text-white/90"
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** "Built for Real Gamers": illustration on the left, copy on the right. */
export function GamingPromo({ banner }: { banner: BannerContent }) {
  return (
    <section aria-label={banner.title} className="container-page py-6">
      <div className="bg-hero grid items-center gap-6 overflow-hidden rounded-[2rem] p-6 text-white shadow-card md:grid-cols-2 md:p-10">
        <div className="relative aspect-[56/38]">
          <BannerImage
            banner={banner}
            fallback={<GamingRig idPrefix={`promo-${banner.id}`} className="h-full w-full" />}
          />
        </div>
        <div className="md:pl-6">
          {banner.eyebrow && (
            <p className="text-sm font-semibold uppercase tracking-wider text-primary-200">
              {banner.eyebrow}
            </p>
          )}
          <h2 className="mt-2 text-3xl font-extrabold leading-tight md:text-5xl">
            <HighlightedText text={banner.title} highlight={banner.titleHighlight} tone="light" />
          </h2>
          {banner.subtitle && <p className="mt-4 max-w-md text-white/70">{banner.subtitle}</p>}
          {banner.cta && (
            <ButtonLink href={banner.cta.href} className="mt-7" arrow>
              {banner.cta.label}
            </ButtonLink>
          )}
        </div>
      </div>
    </section>
  );
}

/** "Ready to Upgrade?": closing call to action on the brand gradient. */
export function UpgradeCta({ banner }: { banner: BannerContent }) {
  return (
    <section aria-label={banner.title} className="container-page py-12 md:py-16">
      <div className="bg-brand-gradient relative grid items-center gap-6 overflow-hidden rounded-[2rem] p-8 text-white shadow-button md:grid-cols-[1.2fr_1fr] md:p-12">
        <div
          aria-hidden
          className="absolute -left-20 -top-20 size-72 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative">
          {banner.eyebrow && (
            <p className="text-sm font-semibold text-white/80">{banner.eyebrow}</p>
          )}
          <h2 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">{banner.title}</h2>
          {banner.subtitle && <p className="mt-3 max-w-md text-white/85">{banner.subtitle}</p>}
          {banner.cta && (
            <ButtonLink href={banner.cta.href} variant="white" className="mt-7" arrow>
              {banner.cta.label}
            </ButtonLink>
          )}
        </div>
        <div className="relative mx-auto aspect-[64/46] w-full max-w-sm">
          <BannerImage
            banner={banner}
            fallback={<HeroLaptop idPrefix={`promo-${banner.id}`} className="h-full w-full" />}
          />
        </div>
      </div>
    </section>
  );
}
