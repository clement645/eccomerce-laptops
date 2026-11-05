'use client';

import { useRouter } from 'next/navigation';
import { useRef, useTransition, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ProductFacets } from '@repo/shared-types';
import { cn } from '@/lib/cn';

export interface FilterState {
  q?: string;
  sort?: string;
  category?: string;
  brand: string[];
  condition: string[];
  spec: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock: boolean;
  onSale: boolean;
}

interface FiltersFormProps {
  idPrefix: string;
  basePath: string;
  facets: ProductFacets;
  state: FilterState;
  /** Facets the page pins (e.g. brand on a brand page) are not shown. */
  hide?: { category?: boolean; brand?: boolean; onSale?: boolean };
  /** Desktop applies each change immediately; the mobile drawer collects changes until "Show results". */
  autoApply?: boolean;
  onApplied?: () => void;
}

/** Convert the form to a clean URL: no empty values, back to page 1. */
export function formToHref(basePath: string, form: HTMLFormElement): string {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (typeof value === 'string' && value.trim() !== '') params.append(key, value.trim());
  }
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-line py-4 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          aria-hidden
          className="size-4 text-ink-subtle transition group-open:rotate-180"
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Check({
  id,
  name,
  value,
  checked,
  label,
  count,
}: {
  id: string;
  name: string;
  value: string;
  checked: boolean;
  label: string;
  count?: number;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg py-1.5 text-sm text-ink hover:text-primary-700"
    >
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="size-4 rounded border-line accent-primary-600"
      />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs text-ink-subtle">{count}</span>}
    </label>
  );
}

export function FiltersForm({
  idPrefix,
  basePath,
  facets,
  state,
  hide = {},
  autoApply = true,
  onApplied,
}: FiltersFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const id = (suffix: string) => `${idPrefix}-${suffix}`.replace(/[^a-zA-Z0-9-]/g, '-');

  const apply = () => {
    if (!formRef.current) return;
    const href = formToHref(basePath, formRef.current);
    startTransition(() => router.push(href, { scroll: false }));
    onApplied?.();
  };

  const shillings = (minor: number) => Math.round(minor / 100);
  const applyIfAuto = () => autoApply && apply();

  return (
    <form
      ref={formRef}
      action={basePath}
      method="get"
      aria-label="Filter products"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      // Checkboxes apply immediately; price inputs apply on Enter or when they lose focus.
      onChange={(event) => {
        const target = event.target as EventTarget;
        if (target instanceof HTMLInputElement && target.type === 'checkbox') applyIfAuto();
      }}
      className={cn('transition-opacity', pending && 'opacity-60')}
    >
      {state.q && <input type="hidden" name="q" value={state.q} />}
      {state.sort && <input type="hidden" name="sort" value={state.sort} />}

      {!hide.category && facets.categories.length > 1 && (
        <Section title="Category">
          <div className="space-y-0.5">
            <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm">
              <input
                type="radio"
                name="category"
                value=""
                defaultChecked={!state.category}
                onChange={applyIfAuto}
                className="accent-primary-600"
              />
              All categories
            </label>
            {facets.categories.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm text-ink"
              >
                <input
                  type="radio"
                  name="category"
                  value={option.value}
                  defaultChecked={state.category === option.value}
                  onChange={applyIfAuto}
                  className="accent-primary-600"
                />
                <span className="flex-1">{option.label}</span>
                <span className="text-xs text-ink-subtle">{option.count}</span>
              </label>
            ))}
          </div>
        </Section>
      )}

      {!hide.brand && facets.brands.length > 0 && (
        <Section title="Brand">
          <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {facets.brands.map((option) => (
              <Check
                key={option.value}
                id={id(`brand-${option.value}`)}
                name="brand"
                value={option.value}
                checked={state.brand.includes(option.value)}
                label={option.label}
                count={option.count}
              />
            ))}
          </div>
        </Section>
      )}

      {facets.price && (
        <Section title="Price (KES)">
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={id('min-price')}>
              Minimum price in KES
            </label>
            <input
              id={id('min-price')}
              name="minPrice"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              defaultValue={state.minPrice}
              placeholder={String(shillings(facets.price.minMinor))}
              onBlur={applyIfAuto}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-100"
            />
            <span aria-hidden className="text-ink-subtle">
              –
            </span>
            <label className="sr-only" htmlFor={id('max-price')}>
              Maximum price in KES
            </label>
            <input
              id={id('max-price')}
              name="maxPrice"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              defaultValue={state.maxPrice}
              placeholder={String(shillings(facets.price.maxMinor))}
              onBlur={applyIfAuto}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-100"
            />
          </div>
        </Section>
      )}

      <Section title="Availability">
        <Check
          id={id('in-stock')}
          name="inStock"
          value="true"
          checked={state.inStock}
          label="In stock"
          count={facets.inStockCount}
        />
        {!hide.onSale && facets.onSaleCount > 0 && (
          <Check
            id={id('on-sale')}
            name="onSale"
            value="true"
            checked={state.onSale}
            label="On sale"
            count={facets.onSaleCount}
          />
        )}
      </Section>

      {facets.conditions.length > 1 && (
        <Section title="Condition">
          {facets.conditions.map((option) => (
            <Check
              key={option.value}
              id={id(`condition-${option.value}`)}
              name="condition"
              value={option.value}
              checked={state.condition.includes(option.value)}
              label={option.label}
              count={option.count}
            />
          ))}
        </Section>
      )}

      {facets.specs.map((spec, index) => (
        <Section key={spec.key} title={spec.key} defaultOpen={index < 3}>
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {spec.options.map((option) => {
              const value = `${spec.key}:${option.value}`;
              return (
                <Check
                  key={value}
                  id={id(`spec-${spec.key}-${option.value}`)}
                  name="spec"
                  value={value}
                  checked={state.spec.includes(value)}
                  label={option.label}
                  count={option.count}
                />
              );
            })}
          </div>
        </Section>
      ))}

      {autoApply ? (
        <noscript>
          <button
            type="submit"
            className="mt-4 w-full rounded-full bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Apply filters
          </button>
        </noscript>
      ) : (
        <div className="sticky bottom-0 -mx-5 mt-4 border-t border-line bg-white px-5 py-4">
          <button
            type="submit"
            className="w-full rounded-full bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-button"
          >
            Show results
          </button>
        </div>
      )}
    </form>
  );
}
