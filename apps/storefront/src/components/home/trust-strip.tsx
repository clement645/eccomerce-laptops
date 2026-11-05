import type { TrustIndicator } from '@repo/shared-types';
import { SettingIcon } from '@/components/icon';

export function TrustStrip({ items }: { items: TrustIndicator[] }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Why shop with us"
      className="container-page relative z-10 -mt-12 md:-mt-14"
    >
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line shadow-card lg:grid-cols-4">
        {items.map((item) => (
          <li
            key={item.title}
            className="flex flex-col items-center bg-white px-4 py-6 text-center md:py-7"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-primary-50 text-primary-600">
              <SettingIcon name={item.icon} className="size-6" />
            </span>
            <h3 className="mt-3 text-sm font-bold text-ink md:text-base">{item.title}</h3>
            <p className="mt-1 text-xs leading-5 text-ink-muted md:text-sm">{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
