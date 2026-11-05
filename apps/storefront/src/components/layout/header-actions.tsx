import Link from 'next/link';
import { Heart } from 'lucide-react';
import { CartLink } from './cart-link';
import { AccountLink } from './account-link';
import { routes } from '@/lib/routes';

/** Wishlist counter arrives with the wishlist; the cart counter is live. */
export function HeaderActions({ wishlistCount = 0 }: { wishlistCount?: number }) {
  // On small screens only the cart stays in the header; account and wishlist live in the menu drawer.
  const items = [
    {
      href: routes.wishlist,
      label: 'Wishlist',
      icon: Heart,
      count: wishlistCount,
      desktopOnly: true,
    },
  ];
  return (
    <nav aria-label="Account" className="flex items-center gap-1">
      <AccountLink className="hidden sm:grid" />
      {items.map(({ href, label, icon: Icon, count, desktopOnly }) => (
        <Link
          key={label}
          href={href}
          className={`relative size-10 place-items-center rounded-full text-ink transition hover:bg-primary-50 hover:text-primary-600 ${desktopOnly ? 'hidden sm:grid' : 'grid'}`}
        >
          <Icon aria-hidden className="size-5" />
          <span className="sr-only">
            {label}
            {count > 0 ? `, ${count} items` : ''}
          </span>
          {count > 0 && (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 grid min-w-4.5 place-items-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Link>
      ))}
      <CartLink />
    </nav>
  );
}
