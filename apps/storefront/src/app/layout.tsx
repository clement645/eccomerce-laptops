import type { Metadata, Viewport } from 'next';
import { Caveat, Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { Suspense } from 'react';
import { FooterSkeleton, SiteFooter } from '@/components/layout/site-footer';
import { Providers } from '@/components/providers';
import { HeaderSkeleton, SiteHeader } from '@/components/layout/site-header';
import { publicEnv } from '@/lib/env';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['600', '700', '800'],
  display: 'swap',
});
const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  weight: ['600'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: 'Laptops & Electronics: Laptops, Gaming PCs and Accessories in Kenya',
    template: '%s | Laptops & Electronics',
  },
  description:
    'Discover powerful laptops, gaming PCs, and accessories designed for productivity, creativity, and performance. Genuine products, M-Pesa checkout and delivery across Kenya.',
  alternates: { canonical: '/' },
  openGraph: { type: 'website', locale: 'en_KE', siteName: 'Laptops & Electronics' },
};

export const viewport: Viewport = {
  themeColor: '#090b26',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-KE" className={`${inter.variable} ${jakarta.variable} ${caveat.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:shadow-card"
        >
          Skip to content
        </a>
        <Providers>
          <Suspense fallback={<HeaderSkeleton />}>
            <SiteHeader />
          </Suspense>
          {children}
          <Suspense fallback={<FooterSkeleton />}>
            <SiteFooter />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
