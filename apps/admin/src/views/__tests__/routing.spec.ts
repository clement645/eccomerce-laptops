import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@repo/shared-types';

function session(permissions: Permission[]) {
  return new Response(
    JSON.stringify({
      accessToken: 't',
      expiresIn: 600,
      user: { id: 'u', email: 'staff@example.com', name: 'Staff', roles: ['X'], permissions },
    }),
    { status: 200 },
  );
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

// Each test re-imports the router (and its views) from scratch, which is slow on a busy CI machine.
describe('admin routing', { timeout: 20_000 }, () => {
  it('sends staff without the dashboard to the first page they can open', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(session(['orders:read', 'customers:read'])));
    const { router } = await import('@/router');
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('orders');
  });

  it('blocks pages the role does not include', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(session(['dashboard:read'])));
    const { router } = await import('@/router');
    await router.push('/staff');
    expect(router.currentRoute.value.name).toBe('no-access');
  });

  it('asks for sign-in without a session, remembering the page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const { router } = await import('@/router');
    await router.push('/orders/EL-2026-001001');
    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.next).toBe('/orders/EL-2026-001001');
  });

  it('lets anyone open an invitation link', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { router } = await import('@/router');
    await router.push('/set-password?token=abc');
    expect(router.currentRoute.value.name).toBe('set-password');
  });
});
