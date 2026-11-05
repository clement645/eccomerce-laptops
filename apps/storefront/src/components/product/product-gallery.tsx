'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { Expand, X } from 'lucide-react';
import type { ProductImageDetail } from '@repo/shared-types';
import { DeviceArt } from '@/components/illustrations/device-art';
import { cn } from '@/lib/cn';
import { hashString } from '@/lib/format';

interface GalleryProps {
  productId: string;
  productName: string;
  slug: string;
  categorySlug: string;
  images: ProductImageDetail[];
}

function Visual({
  props,
  index,
  sizes,
  placement,
  priority,
}: {
  props: GalleryProps;
  index: number;
  sizes: string;
  /** Distinguishes the inline and full-screen copies (SVG gradient ids must be unique). */
  placement: 'inline' | 'fullscreen';
  priority?: boolean;
}) {
  const image = props.images[index];
  if (image) {
    return (
      <Image
        src={image.url}
        alt={image.alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-contain"
      />
    );
  }
  return (
    <DeviceArt
      kind={props.categorySlug}
      idPrefix={`gallery-${props.productId}-${index}-${placement}`}
      accent={hashString(props.slug)}
      title={props.productName}
      className="absolute inset-0 m-auto h-[80%] w-[80%]"
    />
  );
}

/** Product images with thumbnails, hover zoom (fine pointers) and a full-screen view. */
export function ProductGallery(props: GalleryProps) {
  const count = Math.max(props.images.length, 1);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <div>
      <div
        className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-3xl border border-line bg-surface-sunken"
        onPointerMove={(event) => {
          if (event.pointerType !== 'mouse') return;
          const rect = event.currentTarget.getBoundingClientRect();
          setZoom({
            x: ((event.clientX - rect.left) / rect.width) * 100,
            y: ((event.clientY - rect.top) / rect.height) * 100,
          });
        }}
        onPointerLeave={() => setZoom(null)}
        onClick={() => dialogRef.current?.showModal()}
      >
        <div
          className="absolute inset-0 transition-transform duration-200 ease-out"
          style={
            zoom ? { transform: 'scale(2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined
          }
        >
          <Visual
            props={props}
            index={index}
            sizes="(min-width: 1024px) 45vw, 100vw"
            placement="inline"
            priority
          />
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            dialogRef.current?.showModal();
          }}
          className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full bg-white/90 text-ink shadow-card transition hover:text-primary-600"
          aria-label="View image full screen"
        >
          <Expand aria-hidden className="size-4" />
        </button>
      </div>

      {count > 1 && (
        <ul
          className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none"
          aria-label="Product images"
        >
          {props.images.map((image, i) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show image ${i + 1} of ${count}`}
                aria-current={i === index ? 'true' : undefined}
                className={cn(
                  'relative size-20 overflow-hidden rounded-xl border-2 bg-surface-sunken transition',
                  i === index
                    ? 'border-primary-600'
                    : 'border-transparent hover:border-primary-200',
                )}
              >
                <Image src={image.url} alt="" fill sizes="80px" className="object-contain p-1" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-label={`${props.productName} image`}
        className="m-auto h-[90dvh] w-[min(90vw,1100px)] max-w-none rounded-3xl bg-white p-0 backdrop:bg-navy-950/80"
        onClick={(event) => event.target === dialogRef.current && dialogRef.current.close()}
      >
        <div className="relative h-full w-full">
          <Visual props={props} index={index} sizes="90vw" placement="fullscreen" />
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white text-ink shadow-card"
            aria-label="Close"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
      </dialog>
    </div>
  );
}
