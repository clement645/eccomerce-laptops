import type { Metadata } from 'next';
import { CheckoutFlow } from '@/components/checkout/checkout-flow';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return (
    <main id="main" className="flex-1 bg-surface-muted">
      <div className="container-page py-10">
        <h1 className="mb-6 text-3xl font-extrabold">Checkout</h1>
        <CheckoutFlow />
      </div>
    </main>
  );
}
