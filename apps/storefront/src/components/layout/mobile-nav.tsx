'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Heart, Menu, User, X } from 'lucide-react';
import type { CategorySummary } from '@repo/shared-types';
import { routes } from '@/lib/routes';
import { NAV_LINKS } from './nav-links';

/** Drawer built on <dialog>: focus trapping, Escape and inert background come from the browser. */
export function MobileNav({ categories }: { categories: CategorySummary[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="grid size-10 place-items-center rounded-full text-ink hover:bg-primary-50 lg:hidden"
        aria-label="Open menu"
      >
        <Menu aria-hidden className="size-5" />
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Menu"
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(22rem,88vw)] max-w-none bg-white p-0 shadow-2xl backdrop:bg-navy-950/60 backdrop:backdrop-blur-sm"
        onClick={(event) => event.target === dialogRef.current && dialogRef.current.close()}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <span className="font-display text-lg font-bold">Menu</span>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="grid size-10 place-items-center rounded-full hover:bg-primary-50"
              aria-label="Close menu"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-0.5">
              {NAV_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="block rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-primary-50 aria-[current=page]:text-primary-600"
                    aria-current={pathname === link.href ? 'page' : undefined}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 sm:hidden">
              {[
                { label: 'My account', href: routes.account, icon: User },
                { label: 'Wishlist', href: routes.wishlist, icon: Heart },
              ].map(({ label, href, icon: Icon }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-primary-50"
                  >
                    <Icon aria-hidden className="size-4 text-primary-600" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            {categories.length > 0 && (
              <>
                <p className="mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  Categories
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-1">
                  {categories.map((category) => (
                    <li key={category.slug}>
                      <Link
                        href={routes.category(category.slug)}
                        className="block rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-primary-50"
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </nav>
        </div>
      </dialog>
    </>
  );
}
