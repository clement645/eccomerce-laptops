/** Reading time at about 200 words a minute, from sanitized HTML. At least one minute. */
export function readingMinutes(html: string): number {
  const words = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** A plain-text excerpt when the author did not write one. */
export function autoExcerpt(html: string, max = 200): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, text.lastIndexOf(' ', max - 1)).trimEnd()}…`;
}
