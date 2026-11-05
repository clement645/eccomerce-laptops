import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { NewsletterForm } from './newsletter-form';

afterEach(() => vi.unstubAllGlobals());

const respond = (url: string | URL, _init?: RequestInit) =>
  Promise.resolve(
    String(url).includes('/newsletter/subscribe')
      ? new Response(JSON.stringify({ message: 'ok' }), { status: 202 })
      : new Response('{}', { status: 401 }),
  );

describe('NewsletterForm', () => {
  it('checks the address before sending', async () => {
    const fetchMock = vi.fn(respond);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithProviders(<NewsletterForm />);
    await user.type(screen.getByLabelText('Email address'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(screen.getByRole('alert')).toHaveTextContent('valid email');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/newsletter/'))).toBe(false);
  });

  it('asks the subscriber to confirm by email', async () => {
    const fetchMock = vi.fn(respond);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithProviders(<NewsletterForm />);
    await user.type(screen.getByLabelText('Email address'), ' Amina@Example.com ');
    await user.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(await screen.findByRole('status')).toHaveTextContent('check your inbox');
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/newsletter/subscribe'))!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      email: 'amina@example.com',
      source: 'footer',
    });
  });
});
