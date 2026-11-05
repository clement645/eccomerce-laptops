import { DEFAULT_VAT_RATE_BPS } from '@repo/shared-types';

/**
 * Store settings. Business contact details are intentionally empty: they must be entered
 * in the admin dashboard rather than invented here.
 */
export const storeSettings: Record<string, unknown> = {
  'store.profile': {
    name: 'Laptops & Electronics',
    tagline: 'Your Perfect Tech Partner',
    currency: 'KES',
    locale: 'en-KE',
  },
  'store.contact': {
    phone: null,
    email: null,
    whatsappNumber: null,
    address: null,
    mapUrl: null,
    openingHours: null,
  },
  'store.social': { facebook: null, instagram: null, x: null, tiktok: null, youtube: null },
  'announcement.bar': {
    enabled: true,
    messages: ['Free delivery on selected orders', 'Genuine Electronics', 'Secure Checkout'],
    href: null,
  },
  'homepage.trustIndicators': [
    {
      icon: 'truck',
      title: 'Fast Delivery',
      description: 'Countrywide delivery to all 47 counties.',
    },
    {
      icon: 'shield-check',
      title: 'Secure Payments',
      description: 'Pay safely with M-Pesa or card.',
    },
    {
      icon: 'badge-check',
      title: 'Genuine Products',
      description: 'Original products with warranty.',
    },
    {
      icon: 'headset',
      title: 'Dedicated Support',
      description: 'Friendly help before and after you buy.',
    },
  ],
  'homepage.whyChooseUs': [
    {
      icon: 'badge-check',
      title: 'Genuine Products',
      description: 'Original devices sourced through authorised channels, with warranty.',
    },
    {
      icon: 'tag',
      title: 'Competitive Prices',
      description: 'Fair, transparent pricing in KES with no hidden charges at checkout.',
    },
    {
      icon: 'headset',
      title: 'Expert Advice',
      description: 'Not sure which laptop fits? Our team helps you choose.',
    },
    {
      icon: 'rotate-ccw',
      title: 'Warranty Support',
      description: 'We help you with warranty claims and after-sales service.',
    },
  ],
  'tax.vat': { rateBps: DEFAULT_VAT_RATE_BPS, pricesIncludeVat: true },
  'checkout.reservation': { holdMinutes: 15 },
  'checkout.cashOnDelivery': {
    enabled: false,
    maxOrderMinor: 5_000_000,
    counties: ['Nairobi'],
  },
};

export const banners = [
  {
    key: 'hero-tech-partner',
    placement: 'HERO' as const,
    eyebrow: 'Laptops & Electronics',
    title: 'Your Perfect Tech Partner',
    titleHighlight: 'Tech Partner',
    highlights: ['Top Brands', 'Genuine Products', 'Countrywide Delivery'],
    annotation: 'Better performance, bigger dreams',
    subtitle:
      'Discover powerful laptops, gaming PCs, and accessories designed for productivity, creativity, and performance.',
    ctaLabel: 'Shop Now',
    ctaHref: '/shop',
    secondaryCtaLabel: 'Explore Deals',
    secondaryCtaHref: '/deals',
    theme: 'dark',
    sortOrder: 1,
  },
  {
    key: 'hero-business',
    placement: 'HERO' as const,
    eyebrow: 'For teams of every size',
    title: 'Laptops That Mean Business',
    titleHighlight: 'Mean Business',
    highlights: ['EliteBook', 'Latitude', 'ThinkPad'],
    annotation: 'Built for the workday',
    subtitle:
      'EliteBook, Latitude and ThinkPad models with manufacturer warranty and countrywide delivery.',
    ctaLabel: 'Shop Business Laptops',
    ctaHref: '/category/laptops',
    secondaryCtaLabel: 'Contact Sales',
    secondaryCtaHref: '/contact',
    theme: 'dark',
    sortOrder: 2,
  },
  {
    key: 'promo-work-play',
    placement: 'PROMO' as const,
    title: 'Work Smarter. Play Harder.',
    titleHighlight: 'Play Harder.',
    annotation: 'Upgrade your setup',
    subtitle: 'Laptops that keep up with your day and your downtime.',
    ctaLabel: 'Shop Laptops',
    ctaHref: '/category/laptops',
    theme: 'gradient',
    sortOrder: 1,
  },
  {
    key: 'promo-gamers',
    placement: 'PROMO' as const,
    eyebrow: 'Gaming Zone',
    title: 'Built for Real Gamers.',
    titleHighlight: 'Real Gamers.',
    subtitle: 'RTX-powered gaming laptops with high-refresh displays.',
    ctaLabel: 'Shop Gaming',
    ctaHref: '/category/gaming',
    theme: 'dark',
    sortOrder: 2,
  },
  {
    key: 'promo-setup',
    placement: 'PROMO' as const,
    eyebrow: 'Ready to upgrade?',
    title: 'Upgrade Your Setup.',
    titleHighlight: 'Your Setup.',
    subtitle: 'Monitors, keyboards, mice and storage to complete your workspace.',
    ctaLabel: 'Shop Accessories',
    ctaHref: '/category/accessories',
    theme: 'light',
    sortOrder: 3,
  },
];

export const homepageSections = [
  {
    key: 'best_sellers',
    title: 'Best Selling Products',
    config: { source: 'best_sellers', limit: 8 },
    sortOrder: 1,
  },
  {
    key: 'new_arrivals',
    title: 'New Arrivals',
    config: { source: 'newest', limit: 8 },
    sortOrder: 2,
  },
  {
    key: 'featured',
    title: 'Featured Products',
    config: { source: 'featured', limit: 8 },
    sortOrder: 3,
  },
  {
    key: 'gaming_essentials',
    title: 'Gaming Essentials',
    config: { source: 'category', categorySlug: 'gaming', limit: 8 },
    sortOrder: 4,
  },
  {
    key: 'special_offers',
    title: 'Special Offers',
    config: { source: 'on_sale', limit: 8 },
    sortOrder: 5,
  },
  {
    key: 'recommended',
    title: 'Recommended for You',
    config: { source: 'curated', limit: 8 },
    sortOrder: 6,
    curatedProductSlugs: [
      'lenovo-thinkpad-e14-gen-5-amd',
      'apple-macbook-air-13-m3',
      'samsung-t7-portable-ssd-1tb',
      'logitech-mx-master-3s',
    ],
  },
];
