import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth';

const session = {
  accessToken: 't',
  expiresIn: 600,
  user: {
    id: 'u',
    email: 'admin@example.com',
    name: 'Admin',
    roles: ['SUPER_ADMIN'],
    permissions: ['audit:read', 'orders:read'],
  },
};

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => vi.unstubAllGlobals());

describe('admin auth store', () => {
  it('restores a session with the cookie and exposes permissions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(session), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = useAuthStore();
    expect(await auth.ensureSession()).toBe(true);
    expect(auth.can('audit:read')).toBe(true);
    expect(auth.can('staff:manage')).toBe(false);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/admin\/auth\/refresh$/);
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('fetch');
  });

  it('is anonymous when there is no session, and does not ask again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'NO_SESSION', message: 'x' } }), {
        status: 401,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const auth = useAuthStore();
    expect(await auth.ensureSession()).toBe(false);
    expect(await auth.ensureSession()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
