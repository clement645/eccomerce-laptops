'use client';

import { RotateCcw } from 'lucide-react';

/** Shown when page data cannot be loaded (e.g. the API is temporarily unreachable). */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main"
      className="container-page flex flex-1 flex-col items-center justify-center py-24 text-center"
    >
      <p className="text-sm font-semibold text-primary-600">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-extrabold">We couldn’t load this page</h1>
      <p className="mt-3 max-w-md text-ink-muted">
        Please try again in a moment. If the problem continues, contact us.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-button hover:bg-primary-700"
      >
        <RotateCcw aria-hidden className="size-4" />
        Try again
      </button>
    </main>
  );
}
