import Link from 'next/link';
import { connection } from 'next/server';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { StorefrontLayout } from '@repo/shared-types';
import { getLayoutData } from '@/lib/data';
import { routes } from '@/lib/routes';
import { NewsletterForm } from '@/components/newsletter/newsletter-form';
import { Logo } from './logo';
import { DEFAULT_STORE_NAME } from './site-header';

const QUICK_LINKS = [
  { label: 'Shop all products', href: routes.shop },
  { label: 'Deals', href: routes.deals },
  { label: 'Brands', href: routes.brands },
  { label: 'Blog', href: routes.blog },
  { label: 'Contact us', href: routes.contact },
];

const CUSTOMER_SERVICE = [
  { label: 'My account', href: routes.account },
  { label: 'Track my order', href: '/track-order' },
  { label: 'Delivery information', href: '/delivery' },
  { label: 'Returns & warranty', href: '/returns' },
  { label: 'Privacy policy', href: '/privacy' },
];

export async function SiteFooter() {
  await connection();
  let layout: StorefrontLayout | null = null;
  try {
    layout = await getLayoutData();
  } catch {
    layout = null;
  }
  return <FooterView layout={layout} year={new Date().getFullYear()} />;
}

function whatsappLink(number: string) {
  return `https://wa.me/${number.replace(/\D/g, '')}`;
}

export function FooterView({ layout, year }: { layout: StorefrontLayout | null; year?: number }) {
  const name = layout?.settings.profile?.name ?? DEFAULT_STORE_NAME;
  const contact = layout?.settings.contact;
  const social = Object.entries(layout?.settings.social ?? {}).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );

  return (
    <footer className="bg-navy-950 text-white/70">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div>
          <Logo name={name} tagline={layout?.settings.profile?.tagline} tone="light" />
          <p className="mt-4 max-w-xs text-sm leading-6">
            Genuine laptops, desktops, gaming gear and accessories, delivered across Kenya.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm">
            {contact?.phone && (
              <li>
                <a
                  href={`tel:${contact.phone}`}
                  className="inline-flex items-center gap-2 hover:text-white"
                >
                  <Phone aria-hidden className="size-4 text-primary-400" />
                  {contact.phone}
                </a>
              </li>
            )}
            {contact?.whatsappNumber && (
              <li>
                <a
                  href={whatsappLink(contact.whatsappNumber)}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="inline-flex items-center gap-2 hover:text-white"
                >
                  <MessageCircle aria-hidden className="size-4 text-primary-400" />
                  Chat on WhatsApp
                </a>
              </li>
            )}
            {contact?.email && (
              <li>
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex items-center gap-2 hover:text-white"
                >
                  <Mail aria-hidden className="size-4 text-primary-400" />
                  {contact.email}
                </a>
              </li>
            )}
            {contact?.address && (
              <li className="flex items-start gap-2">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-400" />
                {contact.address}
              </li>
            )}
          </ul>
          {social.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {social.map(([network, url]) => (
                <li key={network}>
                  <a
                    href={url}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="inline-flex rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium capitalize hover:border-white/40 hover:text-white"
                  >
                    {network}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <FooterColumn title="Quick links" links={QUICK_LINKS} />
        <FooterColumn title="Customer service" links={CUSTOMER_SERVICE} />

        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
            Newsletter
          </h2>
          <p className="mt-4 text-sm leading-6">
            New arrivals, buying guides and offers. No spam; unsubscribe any time.
          </p>
          <NewsletterForm />
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-5 text-xs sm:flex-row">
          <p>
            © {year ?? ''} {name}. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-white/50">We accept</span>
            <span className="rounded-md bg-white px-2 py-1 text-[11px] font-extrabold tracking-wide text-emerald-700">
              M-PESA
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
        {title}
      </h2>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((link) => (
          <li key={link.label}>
            <Link href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FooterSkeleton() {
  return <FooterView layout={null} />;
}
