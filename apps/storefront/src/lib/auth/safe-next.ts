/** Only allow same-site relative paths as post-login destinations (no open redirects). */
export function safeNext(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return fallback;
  try {
    const url = new URL(value, 'https://example.invalid');
    return url.origin === 'https://example.invalid' ? `${url.pathname}${url.search}` : fallback;
  } catch {
    return fallback;
  }
}
