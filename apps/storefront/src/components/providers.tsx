'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, useState, type ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/auth-context';
import { CartDrawer } from '@/components/cart/cart-drawer';
import { CartUiProvider } from '@/lib/cart/cart-context';

/** Client-side data cache for interactive features (search suggestions now; cart in Phase 6). */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <CartUiProvider>
          {children}
          {/* The drawer reads the URL (closes on navigation), so it must stream behind Suspense. */}
          <Suspense fallback={null}>
            <CartDrawer />
          </Suspense>
        </CartUiProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
