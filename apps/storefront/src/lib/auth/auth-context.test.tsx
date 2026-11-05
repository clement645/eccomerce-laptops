import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

function Probe() {
  const { status, user } = useAuth();
  return <p>{status === 'authenticated' ? `signed in as ${user?.firstName}` : status}</p>;
}

const authResponse = {
  accessToken: 'token-1',
  expiresIn: 600,
  user: {
    id: 'u1',
    email: 'a@b.co',
    firstName: 'Amina',
    lastName: 'Otieno',
    phone: null,
    marketingOptIn: false,
    emailVerified: true,
  },
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('AuthProvider', () => {
  it('does not call the API for visitors who never signed in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('restores the session with the refresh cookie and the CSRF header', async () => {
    localStorage.setItem('sf_signed_in', '1');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(authResponse), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('signed in as Amina')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/auth\/refresh$/);
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('fetch');
  });

  it('forgets the hint when the session is gone', async () => {
    localStorage.setItem('sf_signed_in', '1');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'NO_SESSION', message: 'Not signed in' } }),
            { status: 401 },
          ),
        ),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('sf_signed_in')).toBeNull());
  });
});
