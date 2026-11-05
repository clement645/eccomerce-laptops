import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/auth-context';
import { CartUiProvider } from '@/lib/cart/cart-context';

/** Render inside the same providers the app uses (data cache, auth, cart UI). */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <CartUiProvider>{children}</CartUiProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
}
