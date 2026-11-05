import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps relative paths', () => {
    expect(safeNext('/account/addresses')).toBe('/account/addresses');
    expect(safeNext('/products/x?variant=A')).toBe('/products/x?variant=A');
  });

  it('rejects anything that could leave the site', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '',
      null,
    ]) {
      expect(safeNext(value)).toBe('/account');
    }
  });
});
