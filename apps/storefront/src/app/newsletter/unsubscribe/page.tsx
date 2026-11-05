import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NewsletterLinkAction } from '@/components/newsletter/link-action';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false } };

export default function NewsletterPage() {
  return (
    <main id="main" className="flex-1">
      <div className="container-page max-w-lg py-20">
        <Suspense fallback={null}>
          <NewsletterLinkAction action="unsubscribe" />
        </Suspense>
      </div>
    </main>
  );
}
