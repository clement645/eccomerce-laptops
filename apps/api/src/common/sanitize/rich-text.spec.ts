import { sanitizeRichText } from './rich-text.js';

describe('sanitizeRichText', () => {
  it('keeps safe formatting', () => {
    expect(
      sanitizeRichText(
        '<h2>Specs</h2><p><strong>Fast</strong> and <em>light</em></p><ul><li>16GB</li></ul>',
      ),
    ).toBe('<h2>Specs</h2><p><strong>Fast</strong> and <em>light</em></p><ul><li>16GB</li></ul>');
  });

  it('removes scripts, event handlers, styles and iframes', () => {
    const dirty =
      '<p onclick="steal()" style="color:red">Hi</p><script>alert(1)</script><iframe src="https://evil"></iframe><img src=x onerror=alert(1)>';
    expect(sanitizeRichText(dirty)).toBe('<p>Hi</p>');
  });

  it('neutralises javascript: links and hardens external links', () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a rel="noopener noreferrer nofollow">x</a>',
    );
    expect(sanitizeRichText('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" rel="noopener noreferrer nofollow" target="_blank">x</a>',
    );
  });

  it('returns null for empty input', () => {
    expect(sanitizeRichText('')).toBeNull();
    expect(sanitizeRichText('<script>x</script>')).toBeNull();
    expect(sanitizeRichText(null)).toBeNull();
  });
});
