import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth/auth-context';
import { LoginForm } from './login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('next=/account/addresses'),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
  localStorage.clear();
});

const renderForm = () =>
  render(
    <AuthProvider>
      <LoginForm />
    </AuthProvider>,
  );

describe('LoginForm', () => {
  it('validates before calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findAllByText(/Invalid email|Too small|expected/i)).not.toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in and returns to the requested page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            accessToken: 't',
            expiresIn: 600,
            user: {
              id: 'u',
              email: 'a@b.co',
              firstName: 'A',
              lastName: 'B',
              phone: null,
              marketingOptIn: false,
              emailVerified: true,
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Email address'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'a long passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/account/addresses'));
  });

  it('offers a new verification link when the email is unconfirmed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'EMAIL_NOT_VERIFIED', message: 'Confirm first' } }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'sent' }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Email address'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'a long passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(await screen.findByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText(/sent a new link/)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[1]![0])).toMatch(/\/auth\/resend-verification$/);
  });
});
