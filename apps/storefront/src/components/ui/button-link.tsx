import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'outline-light' | 'white' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white shadow-button hover:bg-primary-700',
  'outline-light': 'border border-white/30 text-white hover:bg-white/10',
  white: 'bg-white text-primary-700 shadow-lg shadow-navy-950/20 hover:bg-primary-50',
  ghost: 'text-primary-600 hover:text-primary-700',
};

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  arrow?: boolean;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  arrow,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        'group inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-200',
        size === 'sm' && 'px-4 py-2 text-sm',
        size === 'md' && 'px-6 py-3 text-sm',
        size === 'lg' && 'px-7 py-3.5 text-base',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
      {arrow && (
        <span
          aria-hidden
          className={cn(
            'grid size-6 place-items-center rounded-full transition group-hover:translate-x-0.5',
            variant === 'primary' ? 'bg-white/20' : 'bg-current/10',
          )}
        >
          <ArrowRight className="size-3.5" />
        </span>
      )}
    </Link>
  );
}
