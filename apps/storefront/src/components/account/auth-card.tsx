import type { ReactNode } from 'react';

/** Centered card for sign-in, registration and recovery pages. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main
      id="main"
      className="flex flex-1 items-start justify-center bg-surface-muted px-4 py-12 md:py-20"
    >
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-line bg-white p-6 shadow-card md:p-8">
          <h1 className="text-2xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-ink-muted">{footer}</div>}
      </div>
    </main>
  );
}
