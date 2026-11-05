import { urls } from './env';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

/** Waits for an email to arrive in Mailpit and returns its plain text. */
export async function waitForEmail(
  to: string,
  subject: string,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = (await (await fetch(`${urls.mailpit}/api/v1/messages?limit=200`)).json()) as {
      messages: MailpitSummary[];
    };
    const hit = list.messages.find(
      (m) =>
        m.Subject === subject && m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()),
    );
    if (hit) {
      const message = (await (await fetch(`${urls.mailpit}/api/v1/message/${hit.ID}`)).json()) as {
        Text: string;
      };
      return message.Text;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `No email "${subject}" to ${to} within ${timeoutMs / 1000}s. Is the worker running?`,
  );
}

export function linkFrom(text: string, path: string): string {
  const match = new RegExp(`https?://[^\\s]+${path.replace(/[/?]/g, (c) => `\\${c}`)}[^\\s]*`).exec(
    text,
  );
  if (!match) throw new Error(`No ${path} link in email`);
  return match[0];
}
