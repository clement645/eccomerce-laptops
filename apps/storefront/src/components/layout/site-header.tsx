import Link from 'next/link';
import { connection } from 'next/server';
import { ChevronDown, Menu } from 'lucide-react';
import type { StorefrontLayout } from '@repo/shared-types';
import { getLayoutData } from '@/lib/data';
import { AnnouncementBar } from './announcement-bar';
import { HeaderActions } from './header-actions';
import { SearchAutocomplete } from './search-autocomplete';
import { Logo } from './logo';
import { MainNav } from './main-nav';
import { MobileNav } from './mobile-nav';
import { NAV_LINKS } from './nav-links';

export const DEFAULT_STORE_NAME = 'Laptops & Electronics';

/** Loads layout data, falling back to a minimal header if the API is unavailable. */
export async function SiteHeader() {
  await connection();
  let layout: StorefrontLayout | null = null;
  try {
    layout = await getLayoutData();
  } catch {
    layout = null;
  }
  return <HeaderView layout={layout} />;
}

/**
 * `placeholder` renders the static shell shown while layout data streams in. It must not use
 * URL-dependent client hooks (usePathname), because on dynamic routes the URL is unknown when the
 * shell is prerendered.
 */
export function HeaderView({
  layout,
  placeholder = false,
}: {
  layout: StorefrontLayout | null;
  placeholder?: boolean;
}) {
  const profile = layout?.settings.profile;
  const categories = layout?.categories ?? [];
  return (
    <>
      <AnnouncementBar announcement={layout?.settings.announcement ?? null} />
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
        <div className="container-page flex h-16 items-center gap-4 lg:h-[72px] lg:gap-8">
          <Logo name={profile?.name ?? DEFAULT_STORE_NAME} tagline={profile?.tagline} />
          <SearchAutocomplete
            id="site-search"
            className="mx-auto hidden w-full max-w-xl md:block"
          />
          <div className="ml-auto flex items-center md:ml-0">
            <HeaderActions />
            {placeholder ? (
              <span aria-hidden className="grid size-10 place-items-center text-ink lg:hidden">
                <Menu className="size-5" />
              </span>
            ) : (
              <MobileNav categories={categories} />
            )}
          </div>
        </div>
        <div className="container-page pb-3 md:hidden">
          <SearchAutocomplete id="site-search-mobile" />
        </div>
        <div className="hidden border-t border-line lg:block">
          <div className="container-page py-1.5">
            {placeholder ? (
              <StaticNav />
            ) : (
              <MainNav categories={categories} brands={layout?.brands ?? []} />
            )}
          </div>
        </div>
      </header>
    </>
  );
}

/** Static shell shown while layout data streams in. */
export function HeaderSkeleton() {
  return <HeaderView layout={null} placeholder />;
}

/** Same links as MainNav, without active state or dropdowns. */
function StaticNav() {
  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {NAV_LINKS.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-ink"
            >
              {link.label}
              {link.menu && <ChevronDown aria-hidden className="size-4" />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
