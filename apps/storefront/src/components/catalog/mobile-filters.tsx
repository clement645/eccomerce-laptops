'use client';

import { useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { FiltersForm, type FilterState } from './filters-form';
import type { ProductFacets } from '@repo/shared-types';

/** Filters in a bottom-anchored <dialog> on small screens. */
export function MobileFilters(props: {
  basePath: string;
  facets: ProductFacets;
  state: FilterState;
  activeCount: number;
  hide?: { category?: boolean; brand?: boolean; onSale?: boolean };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink lg:hidden"
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        Filters
        {props.activeCount > 0 && (
          <span className="grid size-5 place-items-center rounded-full bg-primary-600 text-[11px] text-white">
            {props.activeCount}
          </span>
        )}
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Filters"
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-3xl bg-white p-0 backdrop:bg-navy-950/60"
        onClick={(event) => event.target === dialogRef.current && dialogRef.current.close()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <span className="font-display text-lg font-bold">Filters</span>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close filters"
            className="grid size-10 place-items-center rounded-full hover:bg-primary-50"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="px-5 pb-8">
          <FiltersForm
            {...props}
            idPrefix="mobile-filters"
            autoApply={false}
            onApplied={() => dialogRef.current?.close()}
          />
        </div>
      </dialog>
    </>
  );
}
