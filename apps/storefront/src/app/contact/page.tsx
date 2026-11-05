import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { ContactForm } from '@/components/contact/contact-form';
import { HighlightedText } from '@/components/ui/section-heading';
import { getLayoutData } from '@/lib/data';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Questions about an order, a product or a warranty? Send us a message.',
  alternates: { canonical: routes.contact },
};

async function ContactDetails() {
  await connection();
  const contact = (await getLayoutData().catch(() => null))?.settings.contact;
  const items = [
    contact?.phone && {
      icon: Phone,
      label: 'Call us',
      value: `+${contact.phone}`,
      href: `tel:+${contact.phone}`,
    },
    contact?.whatsappNumber && {
      icon: MessageCircle,
      label: 'WhatsApp',
      value: `+${contact.whatsappNumber}`,
      href: `https://wa.me/${contact.whatsappNumber}`,
    },
    contact?.email && {
      icon: Mail,
      label: 'Email',
      value: contact.email,
      href: `mailto:${contact.email}`,
    },
    contact?.address && {
      icon: MapPin,
      label: 'Visit us',
      value: contact.address,
      href: contact.mapUrl ?? undefined,
    },
    contact?.openingHours && { icon: Clock, label: 'Opening hours', value: contact.openingHours },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; href?: string }[];
  if (items.length === 0)
    return <p className="text-ink-muted">Use the form and we&apos;ll reply by email.</p>;
  return (
    <ul className="space-y-5">
      {items.map(({ icon: Icon, label, value, href }) => (
        <li key={label} className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600">
            <Icon aria-hidden className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink">{label}</span>
            {href ? (
              <a
                href={href}
                className="text-ink-muted hover:text-primary-600"
                {...(href.startsWith('http')
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                {value}
              </a>
            ) : (
              <span className="text-ink-muted">{value}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ContactPage() {
  return (
    <main id="main" className="flex-1">
      <section className="border-b border-line bg-surface-muted">
        <div className="container-page py-10">
          <Breadcrumbs items={[{ name: 'Contact us' }]} />
          <h1 className="mt-3 text-3xl font-extrabold md:text-4xl">
            <HighlightedText text="Get in Touch" highlight="Touch" />
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Questions about an order, a product or a warranty? We&apos;re happy to help.
          </p>
        </div>
      </section>
      <div className="container-page grid gap-10 py-10 lg:grid-cols-[1fr_22rem]">
        <section
          aria-labelledby="form-title"
          className="rounded-2xl border border-line bg-white p-6 shadow-card md:p-8"
        >
          <h2 id="form-title" className="mb-5 text-xl font-bold">
            Send us a message
          </h2>
          <ContactForm />
        </section>
        <aside aria-label="Contact details">
          <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-surface-sunken" />}>
            <ContactDetails />
          </Suspense>
        </aside>
      </div>
    </main>
  );
}
