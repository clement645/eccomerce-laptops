import { describe, expect, it } from 'vitest';
import {
  blogPostInputSchema,
  contactMessageSchema,
  couponInputSchema,
  newsletterSubscribeSchema,
  reviewInputSchema,
  settingSchemas,
} from './content.js';

/**
 * Forms validate with these schemas and send the parsed result, which the API validates again.
 * So every schema must accept its own output.
 */
describe('schemas accept their own output', () => {
  const cases: [string, { parse: (v: unknown) => unknown }, unknown][] = [
    [
      'contact',
      contactMessageSchema,
      {
        name: 'Otieno',
        email: 'O@Example.com ',
        phone: '',
        subject: 'Hi there',
        message: 'Is this in stock?',
        website: '',
      },
    ],
    [
      'contact with phone',
      contactMessageSchema,
      {
        name: 'Otieno',
        email: 'o@example.com',
        phone: '0712 345 678',
        subject: 'Hi there',
        message: 'Is this in stock?',
      },
    ],
    ['review', reviewInputSchema, { rating: 5, title: '', body: 'Great laptop, fast and quiet.' }],
    ['newsletter', newsletterSubscribeSchema, { email: ' A@B.co ' }],
    [
      'blog post',
      blogPostInputSchema,
      { title: 'Guide', slug: 'guide', contentHtml: '<p>x</p>', excerpt: '', coverKey: null },
    ],
    ['coupon', couponInputSchema, { code: 'save10', type: 'PERCENTAGE', percentBps: 1000 }],
    [
      'store contact',
      settingSchemas['store.contact'],
      { email: '', phone: '0712345678', mapUrl: '' },
    ],
    [
      'announcement',
      settingSchemas['announcement.bar'],
      { enabled: true, messages: ['Hi'], href: '' },
    ],
  ];
  it.each(cases)('%s', (_name, schema, input) => {
    const once = schema.parse(input);
    expect(schema.parse(once)).toEqual(once);
  });
});

describe('content rules', () => {
  it('normalises contact phones and codes', () => {
    expect(
      contactMessageSchema.parse({
        name: 'Al',
        email: 'a@b.co',
        phone: '+254 712 345 678',
        subject: 'Hey',
        message: 'Hello there!',
      }).phone,
    ).toBe('254712345678');
    expect(
      couponInputSchema.parse({ code: ' black-friday ', type: 'FIXED_AMOUNT', amountMinor: 100 })
        .code,
    ).toBe('BLACK-FRIDAY');
  });

  it('refuses incomplete coupons and short reviews', () => {
    expect(couponInputSchema.safeParse({ code: 'X10', type: 'PERCENTAGE' }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ rating: 5, body: 'ok' }).success).toBe(false);
  });
});
