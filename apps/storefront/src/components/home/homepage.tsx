import { connection } from 'next/server';
import { getHomepageData, getLayoutData } from '@/lib/data';
import { TopBrands, TrustedBrands } from './brands';
import { CategoryGrid } from './category-grid';
import { HeroCarousel } from './hero-carousel';
import { LatestPosts } from './latest-posts';
import { ProductSection } from './product-section';
import { GamingPromo, SplitPromo, UpgradeCta } from './promo-banners';
import { StatsBanner } from './stats-banner';
import { Testimonials } from './testimonials';
import { TrustStrip } from './trust-strip';
import { WhyChooseUs } from './why-choose-us';

/**
 * Homepage content, in the order of the reference design. Every section comes from the API
 * and hides itself when it has nothing real to show.
 */
export async function Homepage() {
  await connection();
  const [home, layout] = await Promise.all([getHomepageData(), getLayoutData()]);
  const [workPromo, gamingPromo, upgradePromo] = home.promoBanners;
  // The first product sections follow the "Work smarter" banner; the rest follow the gaming banner.
  const leadSections = home.sections.slice(0, 2);
  const laterSections = home.sections.slice(2);

  return (
    <>
      <HeroCarousel slides={home.heroBanners} />
      <TrustStrip items={layout.settings.trustIndicators} />
      <CategoryGrid categories={home.categories} />
      {workPromo && <SplitPromo banner={workPromo} />}
      {leadSections.map((section) => (
        <ProductSection key={section.key} section={section} />
      ))}
      <TrustedBrands brands={home.brands} />
      <StatsBanner stats={home.stats} />
      <TopBrands brands={home.brands} />
      {gamingPromo && (
        <div className="pt-10">
          <GamingPromo banner={gamingPromo} />
        </div>
      )}
      {laterSections.map((section, index) => (
        <ProductSection key={section.key} section={section} tinted={index % 2 === 1} />
      ))}
      <WhyChooseUs items={layout.settings.whyChooseUs} />
      <Testimonials items={home.testimonials} />
      <LatestPosts posts={home.posts} />
      {upgradePromo && <UpgradeCta banner={upgradePromo} />}
    </>
  );
}
