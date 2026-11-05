import { describe, expect, it } from 'vitest';
import { isKnownTag } from './cache-tags';

describe('isKnownTag', () => {
  it('accepts the tags the API sends', () => {
    for (const tag of [
      'catalog',
      'storefront-homepage',
      'storefront-layout',
      'product:hp-elitebook-840-g10',
      'blog',
      'post:choosing-a-laptop',
    ]) {
      expect(isKnownTag(tag)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const tag of [
      '',
      'catalog ',
      'product:',
      'product:../etc',
      'product:UPPER',
      'post:',
      'random',
    ]) {
      expect(isKnownTag(tag)).toBe(false);
    }
  });
});
