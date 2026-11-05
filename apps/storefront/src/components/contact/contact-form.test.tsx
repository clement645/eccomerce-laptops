import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { ContactForm } from './contact-form';

afterEach(() => vi.unstubAllGlobals());

describe('ContactForm', () => {
  it('validates, sends the message and hides the bot trap from people', async () => {
    const fetchMock = vi.fn((url: string | URL, _init?: RequestInit) =>
      Promise.resolve(
        String(url).endsWith('/contact')
          ? new Response(JSON.stringify({ message: 'ok' }), { status: 202 })
          : new Response('{}', { status: 401 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithProviders(<ContactForm />);

    expect(screen.queryByRole('textbox', { name: 'Website' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Enter your name')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Your name'), 'Otieno');
    await user.type(screen.getByLabelText('Email'), 'otieno@example.com');
    await user.type(screen.getByLabelText('Subject'), 'Warranty');
    await user.type(screen.getByLabelText('Message'), 'Is the warranty valid in Kisumu?');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/received your message/)).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/contact'))!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({
      name: 'Otieno',
      email: 'otieno@example.com',
      subject: 'Warranty',
      phone: null,
      website: '',
    });
  });
});
