import type { MailMessage } from './mail.service.js';

const STORE = 'Laptops & Electronics';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function layout(
  title: string,
  paragraphs: string[],
  action?: { label: string; url: string },
): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;color:#334155">${escapeHtml(p)}</p>`)
    .join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#5b3df5;color:#fff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#64748b">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f6f5ff;font-family:Inter,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:16px;padding:32px">
  <tr><td><p style="margin:0 0 24px;font-weight:800;color:#5b3df5">${STORE}</p>
  <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">${escapeHtml(title)}</h1>${body}${button}
  <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">You received this email because of activity on your ${STORE} account.</p></td></tr></table>
  </td></tr></table></body></html>`;
}

function message(
  to: string,
  subject: string,
  title: string,
  paragraphs: string[],
  action?: { label: string; url: string },
): MailMessage {
  const text = [
    title,
    '',
    ...paragraphs,
    ...(action ? ['', `${action.label}: ${action.url}`] : []),
  ].join('\n');
  return { to, subject, text, html: layout(title, paragraphs, action) };
}

const kes = (minor: number) =>
  `KES ${(minor / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;

export interface OrderEmailData {
  orderNumber: string;
  totalMinor: number;
  lines: { name: string; quantity: number }[];
  trackUrl: string;
}

const orderLines = (order: OrderEmailData) => order.lines.map((l) => `${l.quantity} × ${l.name}`);

export const emails = {
  verifyEmail: (to: string, firstName: string, url: string) =>
    message(
      to,
      'Confirm your email address',
      `Welcome, ${firstName}`,
      [
        'Thanks for creating an account. Please confirm your email address to start shopping.',
        'This link expires in 24 hours.',
      ],
      { label: 'Confirm email', url },
    ),

  accountExists: (to: string, url: string) =>
    message(
      to,
      'You already have an account',
      'Someone tried to register with this email',
      [
        'An account already exists for this email address, so no new account was created.',
        "If this was you, sign in instead. If you've forgotten your password, you can reset it.",
        "If this wasn't you, you can ignore this email.",
      ],
      { label: 'Reset password', url },
    ),

  passwordReset: (to: string, url: string) =>
    message(
      to,
      'Reset your password',
      'Reset your password',
      [
        'We received a request to reset your password. This link expires in 1 hour and can be used once.',
        "If you didn't ask for this, you can ignore this email; your password won't change.",
      ],
      { label: 'Choose a new password', url },
    ),

  orderReceived: (to: string, order: OrderEmailData, awaitingPayment: boolean) =>
    message(
      to,
      `Order ${order.orderNumber} received`,
      `Thank you for your order`,
      [
        `We've received order ${order.orderNumber} for ${kes(order.totalMinor)}.`,
        ...orderLines(order),
        awaitingPayment
          ? "Complete the M-Pesa prompt on your phone to confirm it. We'll email you once payment is received."
          : "We'll let you know as soon as it's on its way. You'll pay on delivery.",
      ],
      { label: 'Track your order', url: order.trackUrl },
    ),

  paymentReceived: (to: string, order: OrderEmailData) =>
    message(
      to,
      `Payment received for order ${order.orderNumber}`,
      'Payment received',
      [
        `We've received your payment of ${kes(order.totalMinor)} for order ${order.orderNumber}.`,
        "We're preparing your order and will let you know when it ships.",
      ],
      { label: 'Track your order', url: order.trackUrl },
    ),

  orderCancelled: (to: string, order: OrderEmailData, reason: string, refundDue = false) =>
    message(
      to,
      `Order ${order.orderNumber} was cancelled`,
      'Your order was cancelled',
      [
        reason,
        refundDue
          ? "We're refunding your payment and will let you know once it has been sent."
          : 'No money has been taken for this order. You are welcome to order again at any time.',
      ],
      { label: 'View order', url: order.trackUrl },
    ),

  orderShipped: (
    to: string,
    order: OrderEmailData,
    shipment: { carrier: string | null; trackingNumber: string | null },
  ) =>
    message(
      to,
      `Order ${order.orderNumber} is on its way`,
      'Your order is on its way',
      [
        `Order ${order.orderNumber} has left our store${shipment.carrier ? ` with ${shipment.carrier}` : ''}.`,
        ...(shipment.trackingNumber ? [`Tracking number: ${shipment.trackingNumber}`] : []),
        ...orderLines(order),
      ],
      { label: 'Track your order', url: order.trackUrl },
    ),

  orderDelivered: (to: string, order: OrderEmailData) =>
    message(
      to,
      `Order ${order.orderNumber} was delivered`,
      'Your order was delivered',
      [
        `Order ${order.orderNumber} has been delivered. We hope you enjoy it.`,
        'If anything is wrong with your items, reply to this email and we will help.',
      ],
      { label: 'View order', url: order.trackUrl },
    ),

  staffInvite: (to: string, firstName: string, url: string) =>
    message(
      to,
      'You have been invited to the store admin',
      `Welcome, ${firstName}`,
      [
        'You have been given a staff account for the store dashboard.',
        'Set your password with the button below. The link works once and expires in 72 hours.',
        'At first sign-in you will set up two-factor authentication with an authenticator app.',
      ],
      { label: 'Set your password', url },
    ),

  passwordChanged: (to: string) =>
    message(to, 'Your password was changed', 'Your password was changed', [
      'The password for your account was just changed and you were signed out on other devices.',
      "If you didn't do this, reset your password immediately and contact us.",
    ]),

  newsletterConfirm: (to: string, url: string) =>
    message(
      to,
      'Confirm your subscription',
      'One more step',
      [
        'Please confirm that you want our newsletter: new arrivals, offers and buying guides, about twice a month.',
        "If you didn't ask for this, ignore this email and you won't hear from us.",
      ],
      { label: 'Confirm subscription', url },
    ),

  newsletterWelcome: (to: string, unsubscribeUrl: string) =>
    message(to, "You're subscribed", 'Welcome aboard', [
      "Thanks for confirming. You'll hear from us about new arrivals and offers.",
      `You can unsubscribe at any time: ${unsubscribeUrl}`,
    ]),

  contactNotification: (
    to: string,
    m: {
      name: string;
      email: string;
      phone: string | null;
      subject: string;
      message: string;
      adminUrl: string;
    },
  ) => ({
    ...message(
      to,
      `Contact form: ${m.subject}`,
      `New message from ${m.name}`,
      [
        `From: ${m.name} <${m.email}>${m.phone ? `, +${m.phone}` : ''}`,
        `Subject: ${m.subject}`,
        m.message,
        'Reply to this email to answer the customer directly.',
      ],
      { label: 'Open in admin', url: m.adminUrl },
    ),
    replyTo: m.email,
  }),
};
