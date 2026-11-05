import type { TrustIndicator } from '@repo/shared-types';
import { SettingIcon } from '@/components/icon';
import { SectionHeading } from '@/components/ui/section-heading';

export function WhyChooseUs({ items }: { items: TrustIndicator[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="why-title" className="container-page py-14 md:py-20">
      <SectionHeading
        id="why-title"
        title="Why Choose Us?"
        highlight="Us?"
        subtitle="Shopping for tech made simple and reliable."
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <li
            key={item.title}
            className="flex gap-4 rounded-2xl border border-line bg-white p-5 shadow-card"
          >
            <span className="bg-brand-gradient grid size-12 shrink-0 place-items-center rounded-2xl text-white">
              <SettingIcon name={item.icon} className="size-5" />
            </span>
            <div>
              <h3 className="font-bold text-ink">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-muted">{item.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
