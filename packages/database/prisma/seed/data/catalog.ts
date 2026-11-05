/**
 * Development catalog. Products and specifications are real models; prices are illustrative KES
 * figures, not quotes. Review every price and specification before using this data in production.
 * Ratings and reviews are deliberately absent: they only ever come from real customers.
 */

export interface SeedCategory {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

export const categories: SeedCategory[] = [
  {
    slug: 'laptops',
    name: 'Laptops',
    description: 'Business, student and everyday laptops.',
    sortOrder: 1,
  },
  {
    slug: 'desktops',
    name: 'Desktops',
    description: 'Office and workstation desktop computers.',
    sortOrder: 2,
  },
  {
    slug: 'gaming',
    name: 'Gaming',
    description: 'Gaming laptops and gear built for performance.',
    sortOrder: 3,
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    description: 'Mice, keyboards and everyday essentials.',
    sortOrder: 4,
  },
  {
    slug: 'monitors',
    name: 'Monitors',
    description: 'Office, creative and high-refresh gaming displays.',
    sortOrder: 5,
  },
  {
    slug: 'printers',
    name: 'Printers',
    description: 'Ink tank and laser printers for home and office.',
    sortOrder: 6,
  },
  {
    slug: 'networking',
    name: 'Networking',
    description: 'Routers and Wi-Fi equipment.',
    sortOrder: 7,
  },
  {
    slug: 'storage-devices',
    name: 'Storage Devices',
    description: 'Internal and portable SSDs.',
    sortOrder: 8,
  },
];

export interface SeedBrand {
  slug: string;
  name: string;
  website: string;
  isFeatured: boolean;
}

export const brands: SeedBrand[] = [
  { slug: 'hp', name: 'HP', website: 'https://www.hp.com', isFeatured: true },
  { slug: 'dell', name: 'Dell', website: 'https://www.dell.com', isFeatured: true },
  { slug: 'lenovo', name: 'Lenovo', website: 'https://www.lenovo.com', isFeatured: true },
  { slug: 'apple', name: 'Apple', website: 'https://www.apple.com', isFeatured: true },
  { slug: 'asus', name: 'ASUS', website: 'https://www.asus.com', isFeatured: true },
  { slug: 'acer', name: 'Acer', website: 'https://www.acer.com', isFeatured: true },
  { slug: 'msi', name: 'MSI', website: 'https://www.msi.com', isFeatured: true },
  { slug: 'samsung', name: 'Samsung', website: 'https://www.samsung.com', isFeatured: true },
  { slug: 'logitech', name: 'Logitech', website: 'https://www.logitech.com', isFeatured: false },
  { slug: 'tp-link', name: 'TP-Link', website: 'https://www.tp-link.com', isFeatured: false },
];

/** [group, key, value, isFilterable] */
export type SpecRow = [group: string, key: string, value: string, filterable?: boolean];

export interface SeedVariant {
  sku: string;
  name: string;
  /** Whole shillings (converted to minor units by the seed). */
  price: number;
  compareAt?: number;
  attributes?: Record<string, string>;
  stock: number;
  lowStockThreshold?: number;
}

export interface SeedProduct {
  slug: string;
  name: string;
  brand: string;
  category: string;
  condition?: 'NEW' | 'REFURBISHED';
  shortDescription: string;
  description: string;
  warrantyMonths: number;
  warrantyText: string;
  isFeatured?: boolean;
  /** Days before seeding that the product was published (drives "New arrivals"). */
  publishedDaysAgo: number;
  specs: SpecRow[];
  /** First variant is the default. */
  variants: SeedVariant[];
}

const manufacturerWarranty = (months: number) =>
  `${months}-month manufacturer warranty. Keep your receipt for warranty claims.`;

const laptopSpecs = (s: {
  brand: string;
  model: string;
  condition?: string;
  cpu: string;
  ram: string;
  storage: string;
  gpu: string;
  screen: string;
  resolution: string;
  os: string;
  warranty: string;
  extra?: SpecRow[];
}): SpecRow[] => [
  ['General', 'Manufacturer', s.brand, true],
  ['General', 'Model', s.model],
  ['General', 'Condition', s.condition ?? 'New', true],
  ['Performance', 'Processor', s.cpu, true],
  ['Performance', 'RAM', s.ram, true],
  ['Performance', 'Storage', s.storage, true],
  ['Performance', 'Graphics', s.gpu, true],
  ['Display', 'Screen Size', s.screen, true],
  ['Display', 'Resolution', s.resolution],
  ['Software', 'Operating System', s.os, true],
  ['Warranty', 'Warranty', s.warranty],
  ...(s.extra ?? []),
];

export const products: SeedProduct[] = [
  // ── Laptops ──────────────────────────────────────────────────────────────
  {
    slug: 'hp-elitebook-840-g10',
    name: 'HP EliteBook 840 G10',
    brand: 'hp',
    category: 'laptops',
    shortDescription:
      '14-inch business laptop with 13th Gen Intel Core i7 and enterprise-grade security.',
    description:
      '<p>A slim, durable 14-inch business laptop designed for hybrid work. The 13th Gen Intel Core i7 processor handles multitasking, video calls and office workloads with ease.</p><p>Includes HP Wolf Security features and a comfortable backlit keyboard.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    isFeatured: true,
    publishedDaysAgo: 40,
    specs: laptopSpecs({
      brand: 'HP',
      model: 'EliteBook 840 G10',
      cpu: 'Intel Core i7-1355U',
      ram: '16GB',
      storage: '512GB SSD',
      gpu: 'Intel Iris Xe Graphics',
      screen: '14 inch',
      resolution: '1920 x 1200 (WUXGA)',
      os: 'Windows 11 Pro',
      warranty: '12 months',
    }),
    variants: [
      {
        sku: 'HP-840G10-I7-16-512',
        name: 'Core i7 / 16GB / 512GB SSD',
        price: 189_999,
        compareAt: 214_999,
        stock: 12,
      },
    ],
  },
  {
    slug: 'dell-latitude-5440',
    name: 'Dell Latitude 5440',
    brand: 'dell',
    category: 'laptops',
    shortDescription: 'Reliable 14-inch business laptop with 13th Gen Intel Core i5.',
    description:
      '<p>The Latitude 5440 balances performance, portability and manageability for growing businesses. Choose the configuration that matches your workload.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 35,
    specs: laptopSpecs({
      brand: 'Dell',
      model: 'Latitude 5440',
      cpu: 'Intel Core i5-1345U',
      ram: '8GB / 16GB',
      storage: '256GB / 512GB SSD',
      gpu: 'Intel Iris Xe Graphics',
      screen: '14 inch',
      resolution: '1920 x 1080 (Full HD)',
      os: 'Windows 11 Pro',
      warranty: '12 months',
    }),
    variants: [
      {
        sku: 'DELL-5440-I5-8-256',
        name: 'Core i5 / 8GB / 256GB SSD',
        price: 109_999,
        attributes: { ram: '8GB', storage: '256GB SSD' },
        stock: 9,
      },
      {
        sku: 'DELL-5440-I5-16-512',
        name: 'Core i5 / 16GB / 512GB SSD',
        price: 129_999,
        compareAt: 139_999,
        attributes: { ram: '16GB', storage: '512GB SSD' },
        stock: 6,
      },
    ],
  },
  {
    slug: 'lenovo-thinkpad-e14-gen-5-amd',
    name: 'Lenovo ThinkPad E14 Gen 5 (AMD)',
    brand: 'lenovo',
    category: 'laptops',
    shortDescription: 'ThinkPad reliability with AMD Ryzen 5 performance and a 16:10 display.',
    description:
      '<p>The ThinkPad E14 Gen 5 brings the legendary ThinkPad keyboard and build quality to small businesses, with a tall 16:10 display for productivity.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    isFeatured: true,
    publishedDaysAgo: 28,
    specs: laptopSpecs({
      brand: 'Lenovo',
      model: 'ThinkPad E14 Gen 5',
      cpu: 'AMD Ryzen 5 7530U',
      ram: '16GB',
      storage: '512GB SSD',
      gpu: 'AMD Radeon Graphics',
      screen: '14 inch',
      resolution: '1920 x 1200 (WUXGA)',
      os: 'Windows 11 Pro',
      warranty: '12 months',
    }),
    variants: [
      { sku: 'LEN-E14G5-R5-16-512', name: 'Ryzen 5 / 16GB / 512GB SSD', price: 104_999, stock: 14 },
    ],
  },
  {
    slug: 'apple-macbook-air-13-m3',
    name: 'Apple MacBook Air 13-inch (M3)',
    brand: 'apple',
    category: 'laptops',
    shortDescription: 'Thin, fanless and fast, with the Apple M3 chip and all-day battery life.',
    description:
      '<p>The MacBook Air with M3 is impossibly thin and completely silent thanks to its fanless design. The Liquid Retina display delivers vivid colour for work and entertainment.</p>',
    warrantyMonths: 12,
    warrantyText: '12-month Apple limited warranty.',
    isFeatured: true,
    publishedDaysAgo: 6,
    specs: laptopSpecs({
      brand: 'Apple',
      model: 'MacBook Air 13-inch (M3)',
      cpu: 'Apple M3 (8-core CPU)',
      ram: '16GB unified memory',
      storage: '256GB / 512GB SSD',
      gpu: 'Apple M3 GPU (8-core or 10-core)',
      screen: '13.6 inch',
      resolution: '2560 x 1664 (Liquid Retina)',
      os: 'macOS',
      warranty: '12 months',
      extra: [['Battery', 'Battery Life', 'Up to 18 hours (Apple rating)']],
    }),
    variants: [
      {
        sku: 'APL-MBA13-M3-16-256',
        name: 'M3 8-core GPU / 16GB / 256GB',
        price: 164_999,
        attributes: { ram: '16GB', storage: '256GB SSD', gpu: '8-core' },
        stock: 8,
      },
      {
        sku: 'APL-MBA13-M3-16-512',
        name: 'M3 10-core GPU / 16GB / 512GB',
        price: 199_999,
        attributes: { ram: '16GB', storage: '512GB SSD', gpu: '10-core' },
        stock: 3,
        lowStockThreshold: 3,
      },
    ],
  },
  {
    slug: 'asus-vivobook-15-x1504za',
    name: 'ASUS Vivobook 15 (X1504ZA)',
    brand: 'asus',
    category: 'laptops',
    shortDescription: 'Everyday 15.6-inch laptop for students and home use.',
    description:
      '<p>A practical 15.6-inch laptop with a full-size keyboard and number pad, ideal for assignments, browsing and streaming.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 21,
    specs: laptopSpecs({
      brand: 'ASUS',
      model: 'Vivobook 15 X1504ZA',
      cpu: 'Intel Core i5-1235U',
      ram: '8GB',
      storage: '512GB SSD',
      gpu: 'Intel Iris Xe Graphics',
      screen: '15.6 inch',
      resolution: '1920 x 1080 (Full HD)',
      os: 'Windows 11 Home',
      warranty: '12 months',
    }),
    variants: [
      {
        sku: 'ASUS-X1504ZA-I5-8-512',
        name: 'Core i5 / 8GB / 512GB SSD',
        price: 69_999,
        compareAt: 79_999,
        stock: 20,
      },
    ],
  },
  {
    slug: 'acer-aspire-5-a515-58m',
    name: 'Acer Aspire 5 (A515-58M)',
    brand: 'acer',
    category: 'laptops',
    shortDescription: '15.6-inch all-rounder with 13th Gen Intel Core i5 and 16GB RAM.',
    description:
      '<p>Generous memory and a fast SSD make the Aspire 5 a dependable choice for multitasking at home or work.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 15,
    specs: laptopSpecs({
      brand: 'Acer',
      model: 'Aspire 5 A515-58M',
      cpu: 'Intel Core i5-1335U',
      ram: '16GB',
      storage: '512GB SSD',
      gpu: 'Intel Iris Xe Graphics',
      screen: '15.6 inch',
      resolution: '1920 x 1080 (Full HD)',
      os: 'Windows 11 Home',
      warranty: '12 months',
    }),
    variants: [
      {
        sku: 'ACER-A515-58M-I5-16-512',
        name: 'Core i5 / 16GB / 512GB SSD',
        price: 84_999,
        stock: 11,
      },
    ],
  },
  {
    slug: 'lenovo-ideapad-slim-3-15abr8',
    name: 'Lenovo IdeaPad Slim 3 (15ABR8)',
    brand: 'lenovo',
    category: 'laptops',
    shortDescription: 'Slim 15.6-inch laptop with AMD Ryzen 7 for smooth multitasking.',
    description:
      '<p>Ryzen 7 performance in a slim, light chassis, with a privacy shutter on the webcam.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 3,
    specs: laptopSpecs({
      brand: 'Lenovo',
      model: 'IdeaPad Slim 3 15ABR8',
      cpu: 'AMD Ryzen 7 7730U',
      ram: '16GB',
      storage: '512GB SSD',
      gpu: 'AMD Radeon Graphics',
      screen: '15.6 inch',
      resolution: '1920 x 1080 (Full HD)',
      os: 'Windows 11 Home',
      warranty: '12 months',
    }),
    variants: [
      { sku: 'LEN-IPS3-R7-16-512', name: 'Ryzen 7 / 16GB / 512GB SSD', price: 79_999, stock: 16 },
    ],
  },
  {
    slug: 'dell-latitude-7490-refurbished',
    name: 'Dell Latitude 7490 (Refurbished)',
    brand: 'dell',
    category: 'laptops',
    condition: 'REFURBISHED',
    shortDescription: 'Professionally refurbished 14-inch business laptop. Tested and cleaned.',
    description:
      '<p>A premium business laptop at an accessible price. Each unit is inspected, tested, cleaned and fitted with a fresh operating system installation. Minor cosmetic signs of use are possible.</p>',
    warrantyMonths: 3,
    warrantyText:
      '3-month store warranty covering hardware faults. Excludes physical and liquid damage.',
    publishedDaysAgo: 50,
    specs: laptopSpecs({
      brand: 'Dell',
      model: 'Latitude 7490',
      condition: 'Refurbished',
      cpu: 'Intel Core i5-8350U',
      ram: '8GB',
      storage: '256GB SSD',
      gpu: 'Intel UHD Graphics 620',
      screen: '14 inch',
      resolution: '1920 x 1080 (Full HD)',
      os: 'Windows 11 Pro',
      warranty: '3 months (store)',
    }),
    variants: [
      {
        sku: 'DELL-7490-REF-I5-8-256',
        name: 'Core i5 / 8GB / 256GB SSD',
        price: 34_999,
        compareAt: 42_999,
        stock: 25,
      },
    ],
  },

  // ── Gaming ───────────────────────────────────────────────────────────────
  {
    slug: 'asus-tuf-gaming-a15-fa507nv',
    name: 'ASUS TUF Gaming A15 (FA507NV)',
    brand: 'asus',
    category: 'gaming',
    shortDescription: 'Ryzen 7 and GeForce RTX 4060 in a tough, military-grade chassis.',
    description:
      '<p>Built to last and tuned for 1080p gaming at high refresh rates, with a 144Hz display and RTX 4060 graphics.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    isFeatured: true,
    publishedDaysAgo: 10,
    specs: laptopSpecs({
      brand: 'ASUS',
      model: 'TUF Gaming A15 FA507NV',
      cpu: 'AMD Ryzen 7 7735HS',
      ram: '16GB DDR5',
      storage: '512GB SSD',
      gpu: 'NVIDIA GeForce RTX 4060 8GB',
      screen: '15.6 inch',
      resolution: '1920 x 1080 (Full HD)',
      os: 'Windows 11 Home',
      warranty: '12 months',
      extra: [['Display', 'Refresh Rate', '144Hz', true]],
    }),
    variants: [
      {
        sku: 'ASUS-FA507NV-R7-16-512',
        name: 'Ryzen 7 / RTX 4060 / 16GB / 512GB',
        price: 164_999,
        compareAt: 179_999,
        stock: 7,
      },
    ],
  },
  {
    slug: 'msi-katana-15-b13vfk',
    name: 'MSI Katana 15 (B13VFK)',
    brand: 'msi',
    category: 'gaming',
    shortDescription: '13th Gen Core i7 and RTX 4060 with a 1TB SSD for your game library.',
    description:
      '<p>A sharp-looking gaming laptop with a red-backlit keyboard, RTX 4060 graphics and plenty of storage.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 18,
    specs: laptopSpecs({
      brand: 'MSI',
      model: 'Katana 15 B13VFK',
      cpu: 'Intel Core i7-13620H',
      ram: '16GB DDR5',
      storage: '1TB SSD',
      gpu: 'NVIDIA GeForce RTX 4060 8GB',
      screen: '15.6 inch',
      resolution: '1920 x 1080 (Full HD)',
      os: 'Windows 11 Home',
      warranty: '12 months',
      extra: [['Display', 'Refresh Rate', '144Hz', true]],
    }),
    variants: [
      {
        sku: 'MSI-KAT15-I7-16-1TB',
        name: 'Core i7 / RTX 4060 / 16GB / 1TB',
        price: 174_999,
        stock: 0,
      },
    ],
  },
  {
    slug: 'lenovo-loq-15irh8',
    name: 'Lenovo LOQ 15 (15IRH8)',
    brand: 'lenovo',
    category: 'gaming',
    shortDescription: 'Entry gaming laptop with RTX 4050 and a 144Hz display.',
    description:
      '<p>An accessible way into PC gaming, with Lenovo AI Engine+ tuning and solid thermals.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 8,
    specs: laptopSpecs({
      brand: 'Lenovo',
      model: 'LOQ 15IRH8',
      cpu: 'Intel Core i5-12450H',
      ram: '16GB',
      storage: '512GB SSD',
      gpu: 'NVIDIA GeForce RTX 4050 6GB',
      screen: '15.6 inch',
      resolution: '1920 x 1080 (Full HD)',
      os: 'Windows 11 Home',
      warranty: '12 months',
      extra: [['Display', 'Refresh Rate', '144Hz', true]],
    }),
    variants: [
      {
        sku: 'LEN-LOQ15-I5-16-512',
        name: 'Core i5 / RTX 4050 / 16GB / 512GB',
        price: 129_999,
        stock: 5,
      },
    ],
  },
  {
    slug: 'acer-nitro-v-15-anv15-51',
    name: 'Acer Nitro V 15 (ANV15-51)',
    brand: 'acer',
    category: 'gaming',
    shortDescription: '13th Gen Core i5 and RTX 4050 for smooth 1080p gaming.',
    description:
      '<p>Dual-fan cooling and a 144Hz display make the Nitro V a capable first gaming laptop.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 2,
    specs: laptopSpecs({
      brand: 'Acer',
      model: 'Nitro V 15 ANV15-51',
      cpu: 'Intel Core i5-13420H',
      ram: '16GB',
      storage: '512GB SSD',
      gpu: 'NVIDIA GeForce RTX 4050 6GB',
      screen: '15.6 inch',
      resolution: '1920 x 1080 (Full HD)',
      os: 'Windows 11 Home',
      warranty: '12 months',
      extra: [['Display', 'Refresh Rate', '144Hz', true]],
    }),
    variants: [
      {
        sku: 'ACER-ANV15-I5-16-512',
        name: 'Core i5 / RTX 4050 / 16GB / 512GB',
        price: 124_999,
        compareAt: 134_999,
        stock: 2,
        lowStockThreshold: 3,
      },
    ],
  },

  // ── Desktops ─────────────────────────────────────────────────────────────
  {
    slug: 'hp-prodesk-400-g9-sff',
    name: 'HP ProDesk 400 G9 SFF',
    brand: 'hp',
    category: 'desktops',
    shortDescription: 'Compact small-form-factor office PC with 12th Gen Intel Core i5.',
    description:
      '<p>A space-saving desktop for offices and reception desks. Monitor, keyboard and mouse sold separately.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 45,
    specs: [
      ['General', 'Manufacturer', 'HP', true],
      ['General', 'Model', 'ProDesk 400 G9 SFF'],
      ['General', 'Form Factor', 'Small form factor'],
      ['Performance', 'Processor', 'Intel Core i5-12500', true],
      ['Performance', 'RAM', '8GB', true],
      ['Performance', 'Storage', '512GB SSD', true],
      ['Performance', 'Graphics', 'Intel UHD Graphics 770', true],
      ['Software', 'Operating System', 'Windows 11 Pro', true],
      ['Warranty', 'Warranty', '12 months'],
    ],
    variants: [
      { sku: 'HP-PD400G9-I5-8-512', name: 'Core i5 / 8GB / 512GB SSD', price: 79_999, stock: 10 },
    ],
  },
  {
    slug: 'dell-optiplex-7010-tower',
    name: 'Dell OptiPlex 7010 Tower',
    brand: 'dell',
    category: 'desktops',
    shortDescription:
      'Powerful tower desktop with 13th Gen Intel Core i7 for demanding office work.',
    description:
      '<p>Expandable tower desktop with room to grow. Monitor, keyboard and mouse sold separately.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 30,
    specs: [
      ['General', 'Manufacturer', 'Dell', true],
      ['General', 'Model', 'OptiPlex 7010 Tower'],
      ['General', 'Form Factor', 'Tower'],
      ['Performance', 'Processor', 'Intel Core i7-13700', true],
      ['Performance', 'RAM', '16GB', true],
      ['Performance', 'Storage', '512GB SSD', true],
      ['Performance', 'Graphics', 'Intel UHD Graphics 770', true],
      ['Software', 'Operating System', 'Windows 11 Pro', true],
      ['Warranty', 'Warranty', '12 months'],
    ],
    variants: [
      {
        sku: 'DELL-OP7010T-I7-16-512',
        name: 'Core i7 / 16GB / 512GB SSD',
        price: 124_999,
        stock: 4,
      },
    ],
  },

  // ── Monitors ─────────────────────────────────────────────────────────────
  {
    slug: 'samsung-odyssey-g5-27-qhd',
    name: 'Samsung Odyssey G5 27" QHD Gaming Monitor',
    brand: 'samsung',
    category: 'monitors',
    shortDescription: '27-inch QHD gaming monitor with a 165Hz refresh rate.',
    description: '<p>Sharp QHD resolution and a fast 165Hz refresh rate for fluid gameplay.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 12,
    specs: [
      ['General', 'Manufacturer', 'Samsung', true],
      ['General', 'Model', 'Odyssey G5 (LS27CG510)'],
      ['Display', 'Screen Size', '27 inch', true],
      ['Display', 'Resolution', '2560 x 1440 (QHD)', true],
      ['Display', 'Refresh Rate', '165Hz', true],
      ['Display', 'Panel Type', 'VA'],
      ['Warranty', 'Warranty', '12 months'],
    ],
    variants: [
      { sku: 'SAM-G5-27-QHD', name: '27" QHD 165Hz', price: 42_999, compareAt: 49_999, stock: 9 },
    ],
  },
  {
    slug: 'dell-p2423d-24-qhd',
    name: 'Dell P2423D 24" QHD Monitor',
    brand: 'dell',
    category: 'monitors',
    shortDescription: '23.8-inch QHD IPS office monitor with a fully adjustable stand.',
    description: '<p>Crisp QHD detail and comfortable ergonomics for long working days.</p>',
    warrantyMonths: 36,
    warrantyText: manufacturerWarranty(36),
    publishedDaysAgo: 60,
    specs: [
      ['General', 'Manufacturer', 'Dell', true],
      ['General', 'Model', 'P2423D'],
      ['Display', 'Screen Size', '23.8 inch', true],
      ['Display', 'Resolution', '2560 x 1440 (QHD)', true],
      ['Display', 'Refresh Rate', '60Hz', true],
      ['Display', 'Panel Type', 'IPS'],
      ['Warranty', 'Warranty', '36 months'],
    ],
    variants: [{ sku: 'DELL-P2423D', name: '23.8" QHD IPS', price: 36_999, stock: 13 }],
  },

  // ── Accessories ──────────────────────────────────────────────────────────
  {
    slug: 'logitech-mx-master-3s',
    name: 'Logitech MX Master 3S Wireless Mouse',
    brand: 'logitech',
    category: 'accessories',
    shortDescription:
      'Quiet-click performance mouse with an 8,000 DPI sensor and MagSpeed scrolling.',
    description:
      '<p>Precise tracking on almost any surface, including glass, with near-silent clicks and USB-C fast charging.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 25,
    specs: [
      ['General', 'Manufacturer', 'Logitech', true],
      ['General', 'Model', 'MX Master 3S'],
      ['Connectivity', 'Connection', 'Bluetooth, Logi Bolt receiver'],
      ['Performance', 'Sensor', '8,000 DPI'],
      ['Power', 'Battery', 'Rechargeable (USB-C)'],
    ],
    variants: [
      {
        sku: 'LOGI-MXM3S-GRAPHITE',
        name: 'Graphite',
        price: 14_999,
        attributes: { colour: 'Graphite' },
        stock: 30,
      },
    ],
  },
  {
    slug: 'logitech-mx-keys-s',
    name: 'Logitech MX Keys S Wireless Keyboard',
    brand: 'logitech',
    category: 'accessories',
    shortDescription: 'Full-size illuminated wireless keyboard with smart backlighting.',
    description:
      '<p>Spherically dished keys for comfortable, accurate typing, with multi-device switching.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 4,
    specs: [
      ['General', 'Manufacturer', 'Logitech', true],
      ['General', 'Model', 'MX Keys S'],
      ['Connectivity', 'Connection', 'Bluetooth, Logi Bolt receiver'],
      ['Power', 'Battery', 'Rechargeable (USB-C)'],
    ],
    variants: [
      {
        sku: 'LOGI-MXKEYS-S',
        name: 'Graphite',
        price: 17_999,
        attributes: { colour: 'Graphite' },
        stock: 15,
      },
    ],
  },

  // ── Storage ──────────────────────────────────────────────────────────────
  {
    slug: 'samsung-t7-portable-ssd-1tb',
    name: 'Samsung T7 Portable SSD 1TB',
    brand: 'samsung',
    category: 'storage-devices',
    shortDescription: 'Pocket-sized USB 3.2 Gen 2 SSD with transfer speeds up to 1,050 MB/s.',
    description:
      '<p>Fast, compact and shock-resistant external storage for backups, photos and projects.</p>',
    warrantyMonths: 36,
    warrantyText: manufacturerWarranty(36),
    publishedDaysAgo: 20,
    specs: [
      ['General', 'Manufacturer', 'Samsung', true],
      ['General', 'Model', 'T7 Portable SSD'],
      ['Storage', 'Capacity', '1TB', true],
      ['Storage', 'Interface', 'USB 3.2 Gen 2 (USB-C)'],
      ['Performance', 'Read Speed', 'Up to 1,050 MB/s'],
    ],
    variants: [
      {
        sku: 'SAM-T7-1TB-GREY',
        name: '1TB Titan Grey',
        price: 15_999,
        compareAt: 18_499,
        attributes: { capacity: '1TB' },
        stock: 18,
      },
    ],
  },
  {
    slug: 'samsung-990-pro-1tb-nvme',
    name: 'Samsung 990 PRO 1TB NVMe SSD',
    brand: 'samsung',
    category: 'storage-devices',
    shortDescription: 'PCIe 4.0 NVMe M.2 SSD with sequential reads up to 7,450 MB/s.',
    description:
      '<p>A top-tier internal SSD upgrade for desktops, laptops and gaming builds with an M.2 slot.</p>',
    warrantyMonths: 60,
    warrantyText: '5-year limited manufacturer warranty.',
    publishedDaysAgo: 33,
    specs: [
      ['General', 'Manufacturer', 'Samsung', true],
      ['General', 'Model', '990 PRO'],
      ['Storage', 'Capacity', '1TB', true],
      ['Storage', 'Interface', 'PCIe 4.0 x4 NVMe, M.2 2280'],
      ['Performance', 'Read Speed', 'Up to 7,450 MB/s'],
    ],
    variants: [
      {
        sku: 'SAM-990PRO-1TB',
        name: '1TB',
        price: 17_999,
        attributes: { capacity: '1TB' },
        stock: 11,
      },
    ],
  },

  // ── Networking ───────────────────────────────────────────────────────────
  {
    slug: 'tp-link-archer-ax55',
    name: 'TP-Link Archer AX55 Wi-Fi 6 Router',
    brand: 'tp-link',
    category: 'networking',
    shortDescription: 'AX3000 dual-band Wi-Fi 6 router for faster, more reliable home Wi-Fi.',
    description:
      '<p>Wi-Fi 6 improves speed and capacity for homes and small offices with many connected devices.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 55,
    specs: [
      ['General', 'Manufacturer', 'TP-Link', true],
      ['General', 'Model', 'Archer AX55'],
      ['Wireless', 'Wi-Fi Standard', 'Wi-Fi 6 (802.11ax)', true],
      ['Wireless', 'Speed Class', 'AX3000 dual-band'],
    ],
    variants: [{ sku: 'TPL-AX55', name: 'AX3000', price: 11_999, stock: 22 }],
  },

  // ── Printers ─────────────────────────────────────────────────────────────
  {
    slug: 'hp-smart-tank-580',
    name: 'HP Smart Tank 580 All-in-One',
    brand: 'hp',
    category: 'printers',
    shortDescription:
      'Wireless ink tank printer that prints, scans and copies at a low cost per page.',
    description:
      '<p>Refillable ink tanks keep printing costs low for homes, students and small offices.</p>',
    warrantyMonths: 12,
    warrantyText: manufacturerWarranty(12),
    publishedDaysAgo: 14,
    specs: [
      ['General', 'Manufacturer', 'HP', true],
      ['General', 'Model', 'Smart Tank 580'],
      ['Functions', 'Functions', 'Print, scan, copy'],
      ['Connectivity', 'Connection', 'Wi-Fi, USB'],
      ['Printing', 'Technology', 'Ink tank (colour)'],
    ],
    variants: [{ sku: 'HP-ST580', name: 'Smart Tank 580', price: 26_999, stock: 6 }],
  },
];
