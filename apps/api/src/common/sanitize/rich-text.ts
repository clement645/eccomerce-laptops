import sanitizeHtml from 'sanitize-html';

/**
 * Allowlist sanitizer for rich text (product descriptions, blog posts). Anything not listed is
 * removed: scripts, event handlers, styles, iframes, javascript: URLs.
 * External links open safely (noopener, noreferrer, nofollow).
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'h2',
    'h3',
    'h4',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'blockquote',
    'a',
    'code',
    'pre',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  // rel and target are set by transformTags below; user-supplied rel is always overwritten.
  allowedAttributes: { a: ['href', 'title', 'rel', 'target'], th: ['scope'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: 'noopener noreferrer nofollow',
        ...(isExternal(attribs.href) ? { target: '_blank' } : {}),
      },
    }),
  },
};

function isExternal(href: string | undefined): boolean {
  return Boolean(href && /^https?:\/\//i.test(href));
}

export function sanitizeRichText(html: string | null | undefined): string | null {
  if (!html) return null;
  const clean = sanitizeHtml(html, OPTIONS).trim();
  return clean.length > 0 ? clean : null;
}
