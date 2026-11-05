import { cn } from '@/lib/cn';

/** Handwritten note with a curved arrow, as in the reference design. Decorative. */
export function Annotation({
  text,
  className,
  arrow = 'down-left',
}: {
  text: string;
  className?: string;
  arrow?: 'down-left' | 'down-right';
}) {
  return (
    <div aria-hidden className={cn('pointer-events-none select-none', className)}>
      <p className="-rotate-6 font-script text-2xl leading-6">{text}</p>
      <svg
        viewBox="0 0 80 50"
        className={cn('mt-1 h-10 w-16', arrow === 'down-right' ? 'ml-auto -scale-x-100' : '')}
        fill="none"
      >
        <path
          d="M70 4 C 60 30, 35 40, 10 38"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M18 30 L10 38 L20 44"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
