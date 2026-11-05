'use client';

import { useRouter } from 'next/navigation';
import { useId, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2, Search, Tag } from 'lucide-react';
import { createApiClient } from '@repo/api-client';
import type { SearchSuggestions } from '@repo/shared-types';
import { cn } from '@/lib/cn';
import { formatKes } from '@/lib/format';
import { PUBLIC_API_URL } from '@/lib/public-config';
import { routes } from '@/lib/routes';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const api = createApiClient({ baseUrl: PUBLIC_API_URL });

interface Option {
  id: string;
  href: string;
  label: string;
  meta: string;
  group: 'Products' | 'Categories' | 'Brands';
}

function toOptions(data: SearchSuggestions | undefined, baseId: string): Option[] {
  if (!data) return [];
  return [
    ...data.products.map((p, i) => ({
      id: `${baseId}-p${i}`,
      href: routes.product(p.slug),
      label: p.name,
      meta: `${p.category} · ${formatKes(p.priceMinor)}`,
      group: 'Products' as const,
    })),
    ...data.categories.map((c, i) => ({
      id: `${baseId}-c${i}`,
      href: routes.category(c.slug),
      label: c.name,
      meta: 'Category',
      group: 'Categories' as const,
    })),
    ...data.brands.map((b, i) => ({
      id: `${baseId}-b${i}`,
      href: routes.brand(b.slug),
      label: b.name,
      meta: 'Brand',
      group: 'Brands' as const,
    })),
  ];
}

/**
 * Search box with suggestions (WAI-ARIA combobox pattern). Without JavaScript it is still a plain
 * GET form to /search.
 */
export function SearchAutocomplete({ id, className }: { id: string; className?: string }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebouncedValue(term.trim(), 200);
  const enabled = debounced.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ['search-suggest', debounced.toLowerCase()],
    queryFn: () =>
      api.request<SearchSuggestions>('/catalog/search/suggest', { query: { q: debounced } }),
    enabled,
    placeholderData: keepPreviousData,
  });

  const options = useMemo(() => (enabled ? toOptions(data, listId) : []), [data, enabled, listId]);
  const expanded = open && enabled && (options.length > 0 || !isFetching);
  const activeOption = active >= 0 ? options[active] : undefined;

  const go = (href: string) => {
    setOpen(false);
    inputRef.current?.blur();
    router.push(href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (options.length ? (i + 1) % options.length : -1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (options.length ? (i - 1 + options.length) % options.length : -1));
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (event.key === 'Enter' && activeOption) {
      event.preventDefault();
      go(activeOption.href);
    }
  };

  let lastGroup: string | null = null;

  return (
    <form action={routes.search} method="get" role="search" className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        Search products
      </label>
      <div className="flex items-center rounded-full border border-line bg-surface-sunken p-1 pl-4 transition focus-within:border-primary-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary-100">
        <input
          ref={inputRef}
          id={id}
          name="q"
          type="search"
          required
          maxLength={100}
          autoComplete="off"
          placeholder="Search laptops, accessories, brands…"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={activeOption?.id}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {isFetching && enabled && (
          <Loader2 aria-hidden className="mr-2 size-4 animate-spin text-ink-subtle" />
        )}
        <button
          type="submit"
          aria-label="Search"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-600 text-white transition hover:bg-primary-700"
        >
          <Search aria-hidden className="size-4" />
        </button>
      </div>

      <div
        id={listId}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-card-hover"
      >
        {options.length === 0 ? (
          <p className="px-3 py-4 text-sm text-ink-muted">
            No matches for “{debounced}”. Press Enter to search anyway.
          </p>
        ) : (
          options.map((option, index) => {
            const heading = option.group !== lastGroup ? option.group : null;
            lastGroup = option.group;
            return (
              <div key={option.id} role="presentation">
                {heading && (
                  <p
                    role="presentation"
                    className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle"
                  >
                    {heading}
                  </p>
                )}
                <div
                  id={option.id}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => go(option.href)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5',
                    index === active ? 'bg-primary-50' : 'hover:bg-primary-50',
                  )}
                >
                  {option.group === 'Products' ? (
                    <Search aria-hidden className="size-4 shrink-0 text-ink-subtle" />
                  ) : (
                    <Tag aria-hidden className="size-4 shrink-0 text-primary-600" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {option.label}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">{option.meta}</span>
                  </span>
                </div>
              </div>
            );
          })
        )}
        {options.length > 0 && (
          <button
            type="submit"
            onMouseDown={(event) => event.preventDefault()}
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-primary-600 hover:bg-primary-50"
          >
            See all results for “{debounced}”
          </button>
        )}
      </div>
    </form>
  );
}
