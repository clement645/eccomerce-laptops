'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { BrandSummary, CategorySummary } from '@repo/shared-types';
import { cn } from '@/lib/cn';
import { routes } from '@/lib/routes';
import { NAV_LINKS } from './nav-links';

interface MainNavProps {
  categories: CategorySummary[];
  brands: BrandSummary[];
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop navigation row with dropdowns for categories and brands. */
export function MainNav({ categories, brands }: MainNavProps) {
  const pathname = usePathname();
  // A dropdown belongs to the page it was opened on, so navigating closes it without an effect.
  const [openFor, setOpenFor] = useState<{ menu: string; pathname: string } | null>(null);
  const open = openFor?.pathname === pathname ? openFor.menu : null;
  const setOpen = (menu: string | null) => setOpenFor(menu ? { menu, pathname } : null);
  const navRef = useRef<HTMLElement>(null);
  const menuId = useId();

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenFor(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpenFor(null);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <nav ref={navRef} aria-label="Main" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {NAV_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          const linkClass = cn(
            'relative inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition',
            active ? 'text-primary-600' : 'text-ink hover:text-primary-600',
          );
          if (!link.menu) {
            return (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className={linkClass}
                  aria-current={active ? 'page' : undefined}
                >
                  {link.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary-600"
                    />
                  )}
                </Link>
              </li>
            );
          }
          const expanded = open === link.menu;
          const panelId = `${menuId}-${link.menu}`;
          return (
            <li key={link.label} className="relative">
              <button
                type="button"
                className={linkClass}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : link.menu!)}
              >
                {link.label}
                <ChevronDown
                  aria-hidden
                  className={cn('size-4 transition', expanded && 'rotate-180')}
                />
              </button>
              {expanded && (
                <div
                  id={panelId}
                  className="absolute left-0 top-full z-50 mt-2 w-[min(36rem,80vw)] rounded-2xl border border-line bg-white p-3 shadow-card-hover"
                >
                  {link.menu === 'categories' ? (
                    <ul className="grid grid-cols-2 gap-1">
                      {categories.map((category) => (
                        <li key={category.slug}>
                          <Link
                            href={routes.category(category.slug)}
                            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-primary-50"
                          >
                            <span className="font-medium text-ink">{category.name}</span>
                            <span className="text-xs text-ink-subtle">{category.productCount}</span>
                          </Link>
                        </li>
                      ))}
                      <li className="col-span-2 border-t border-line pt-2">
                        <Link
                          href={routes.shop}
                          className="block rounded-xl px-3 py-2 text-sm font-semibold text-primary-600 hover:bg-primary-50"
                        >
                          Browse all products
                        </Link>
                      </li>
                    </ul>
                  ) : (
                    <ul className="grid grid-cols-3 gap-1">
                      {brands.map((brand) => (
                        <li key={brand.slug}>
                          <Link
                            href={routes.brand(brand.slug)}
                            className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-primary-50"
                          >
                            {brand.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
