'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { BannerContent } from '@repo/shared-types';
import { HeroLaptop } from '@/components/illustrations/scenes';
import { ButtonLink } from '@/components/ui/button-link';
import { HighlightedText } from '@/components/ui/section-heading';
import { cn } from '@/lib/cn';
import { Annotation } from './annotation';

const AUTOPLAY_MS = 7000;

export function HeroCarousel({ slides }: { slides: BannerContent[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const count = slides.length;

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused || reduceMotion) return;
    const timer = setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [count, go, index, paused, reduceMotion]);

  const slide = slides[index];
  if (!slide) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured promotions"
      className="bg-hero relative overflow-hidden text-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />
      <LazyMotion features={domAnimation} strict>
        <div className="container-page relative pb-20 pt-10 md:pb-28 md:pt-14">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}`}
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="grid items-center gap-8 md:grid-cols-[1.05fr_1fr] md:gap-4"
            >
              <div className="relative z-10 max-w-xl">
                {slide.eyebrow && (
                  <p className="text-sm font-medium text-white/70">{slide.eyebrow}</p>
                )}
                <h2 className="mt-3 text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-6xl">
                  <HighlightedText
                    text={slide.title}
                    highlight={slide.titleHighlight}
                    tone="light"
                  />
                </h2>
                {/* Chips on small screens (they wrap cleanly); divider-separated text from sm up, as in the design. */}
                {slide.highlights.length > 0 && (
                  <ul className="mt-5 flex flex-wrap items-center gap-2 text-sm font-semibold text-white/90 sm:gap-x-0">
                    {slide.highlights.map((item, i) => (
                      <li
                        key={item}
                        className="flex items-center rounded-full bg-white/10 px-3 py-1 sm:bg-transparent sm:p-0"
                      >
                        {i > 0 && (
                          <span aria-hidden className="mx-3 hidden h-4 w-px bg-white/30 sm:block" />
                        )}
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
                {slide.subtitle && (
                  <p className="mt-5 max-w-md text-base leading-7 text-white/70">
                    {slide.subtitle}
                  </p>
                )}
                {(slide.cta || slide.secondaryCta) && (
                  <div className="mt-8 flex flex-wrap gap-3">
                    {slide.cta && (
                      <ButtonLink href={slide.cta.href} size="lg" arrow>
                        {slide.cta.label}
                      </ButtonLink>
                    )}
                    {slide.secondaryCta && (
                      <ButtonLink href={slide.secondaryCta.href} size="lg" variant="outline-light">
                        {slide.secondaryCta.label}
                      </ButtonLink>
                    )}
                  </div>
                )}
              </div>

              <div className="relative">
                {slide.image ? (
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={slide.image.url}
                      alt={slide.image.alt}
                      fill
                      priority={index === 0}
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-contain"
                    />
                  </div>
                ) : (
                  <HeroLaptop
                    idPrefix={`hero-${slide.id}`}
                    className="mx-auto w-full max-w-[620px] drop-shadow-2xl"
                  />
                )}
                {slide.annotation && (
                  <Annotation
                    text={slide.annotation}
                    className="absolute -top-2 right-0 hidden w-40 text-white/90 md:block lg:right-4"
                  />
                )}
              </div>
            </m.div>
          </AnimatePresence>

          {count > 1 && (
            <div className="mt-8 flex items-center gap-3 md:mt-2">
              <button
                type="button"
                onClick={() => go(index - 1)}
                className="grid size-9 place-items-center rounded-full border border-white/20 text-white/80 transition hover:bg-white/10"
                aria-label="Previous slide"
              >
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <div className="flex gap-2">
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    aria-current={i === index ? 'true' : undefined}
                    className={cn(
                      'h-2 rounded-full transition-all',
                      i === index ? 'w-8 bg-primary-400' : 'w-2 bg-white/30 hover:bg-white/60',
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => go(index + 1)}
                className="grid size-9 place-items-center rounded-full border border-white/20 text-white/80 transition hover:bg-white/10"
                aria-label="Next slide"
              >
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>
          )}
        </div>
      </LazyMotion>
    </section>
  );
}
