import Image from 'next/image';
import type { ProductCard } from '@repo/shared-types';
import { DeviceArt } from '@/components/illustrations/device-art';
import { hashString } from '@/lib/format';

/** Product photo when uploaded; otherwise an illustration of the product type. */
export function ProductVisual({
  product,
  sizes,
  priority,
}: {
  product: ProductCard;
  sizes: string;
  priority?: boolean;
}) {
  if (product.image) {
    return (
      <Image
        src={product.image.url}
        alt={product.image.alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-contain p-4 transition duration-300 group-hover:scale-105"
      />
    );
  }
  return (
    <DeviceArt
      kind={product.category.slug}
      idPrefix={`p-${product.id}`}
      accent={hashString(product.slug)}
      title={product.name}
      className="absolute inset-0 m-auto h-[82%] w-[82%] transition duration-300 group-hover:scale-105"
    />
  );
}
