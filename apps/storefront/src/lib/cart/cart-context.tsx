'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type RequestOptions } from '@repo/api-client';
import type { Cart } from '@repo/shared-types';
import { publicApi, useAuth } from '@/lib/auth/auth-context';

/** Cart and checkout endpoints identify guests by cookie, so every call carries the CSRF header. */
function withCsrfHeader(init: RequestOptions = {}): RequestOptions {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'fetch');
  return { ...init, headers };
}

/** API call as the current shopper: Bearer token when signed in, guest cookie otherwise. */
export function useShopperRequest() {
  const { status, request } = useAuth();
  return useCallback(
    <T,>(path: string, init?: RequestOptions): Promise<T> =>
      status === 'authenticated'
        ? request<T>(path, withCsrfHeader(init))
        : publicApi.request<T>(path, withCsrfHeader(init)),
    [status, request],
  );
}

interface CartUi {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  notice: string | null;
  setNotice: (notice: string | null) => void;
}

const CartUiContext = createContext<CartUi | null>(null);

export function CartUiProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const value = useMemo<CartUi>(
    () => ({
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      notice,
      setNotice,
    }),
    [drawerOpen, notice],
  );
  return <CartUiContext.Provider value={value}>{children}</CartUiContext.Provider>;
}

export function useCartUi(): CartUi {
  const context = useContext(CartUiContext);
  if (!context) throw new Error('useCartUi must be used inside CartUiProvider');
  return context;
}

function cartKey(userId: string | undefined) {
  return ['cart', userId ?? 'guest'] as const;
}

/** The current cart. Re-fetched after sign-in, which also merges the guest cart into the account. */
export function useCart() {
  const { status, user } = useAuth();
  const call = useShopperRequest();
  return useQuery({
    queryKey: cartKey(user?.id),
    queryFn: () => call<Cart>('/cart'),
    enabled: status !== 'loading',
    staleTime: 15_000,
  });
}

export function cartErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

export function useCartActions() {
  const { user } = useAuth();
  const call = useShopperRequest();
  const queryClient = useQueryClient();
  const { openDrawer, setNotice } = useCartUi();
  const store = (cart: Cart) => queryClient.setQueryData(cartKey(user?.id), cart);

  const add = useMutation({
    mutationFn: (input: { variantId: string; quantity: number }) =>
      call<Cart>('/cart/items', { method: 'POST', body: input }),
    onSuccess: (cart) => {
      store(cart);
      setNotice(null);
      openDrawer();
    },
    onError: (error) => {
      setNotice(cartErrorMessage(error));
      openDrawer();
    },
  });

  const update = useMutation({
    mutationFn: (input: { variantId: string; quantity: number }) =>
      call<Cart>(`/cart/items/${input.variantId}`, {
        method: 'PATCH',
        body: { quantity: input.quantity },
      }),
    onSuccess: store,
    onError: (error) => setNotice(cartErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (variantId: string) => call<Cart>(`/cart/items/${variantId}`, { method: 'DELETE' }),
    onSuccess: store,
    onError: (error) => setNotice(cartErrorMessage(error)),
  });

  return { add, update, remove };
}

/** After an order is placed the cart is empty; drop the cached copy. */
export function useResetCart() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ['cart'] }), [queryClient]);
}
