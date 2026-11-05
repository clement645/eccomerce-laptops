'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import type { TestimonialContent } from '@repo/shared-types';
import { cn } from '@/lib/cn';

/** Rendered only when real testimonials exist; none are ever seeded or invented. */
export function Testimonials({ items }: { items: TestimonialContent[] }) {
  const [index, setIndex] = useState(0);
  const count = items.length;
  const item = items[index];
  if (!item) return null;
  const go = (next: number) => setIndex(((next % count) + count) % count);
  const initials = item.authorName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <section
      aria-labelledby="testimonials-title"
      className="bg-brand-gradient py-14 text-white md:py-20"
    >
      <div className="container-page">
        <div className="text-center">
          <h2 id="testimonials-title" className="text-2xl font-extrabold md:text-3xl">
            What Our Customers Say
          </h2>
          <p className="mt-1.5 text-white/75">Real people, real experiences.</p>
        </div>
        <div
          className="mt-10 flex items-center justify-center gap-3 md:gap-6"
          aria-roledescription="carousel"
          aria-label="Customer testimonials"
        >
          {count > 1 && (
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous testimonial"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 transition hover:bg-white/25"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
          )}
          <figure
            key={item.id}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
            className="w-full max-w-2xl rounded-3xl bg-white p-6 text-ink shadow-2xl md:p-8"
          >
            <Quote aria-hidden className="size-8 text-primary-200" />
            <blockquote className="mt-3 text-base leading-7 md:text-lg">“{item.quote}”</blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              {item.avatarUrl ? (
                <Image
                  src={item.avatarUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="size-12 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="bg-brand-gradient grid size-12 place-items-center rounded-full font-bold text-white"
                >
                  {initials}
                </span>
              )}
              <span>
                <span className="block font-bold">{item.authorName}</span>
                {(item.authorTitle || item.location) && (
                  <span className="block text-sm text-ink-muted">
                    {[item.authorTitle, item.location].filter(Boolean).join(', ')}
                  </span>
                )}
              </span>
            </figcaption>
          </figure>
          {count > 1 && (
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next testimonial"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 transition hover:bg-white/25"
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
          )}
        </div>
        {count > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            {items.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show testimonial ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === index ? 'w-8 bg-white' : 'w-2 bg-white/40',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
