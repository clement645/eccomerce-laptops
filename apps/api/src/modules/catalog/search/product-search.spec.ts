import { searchTokens } from './product-search.js';

describe('searchTokens', () => {
  it('lower-cases, strips accents and punctuation', () => {
    expect(searchTokens('MacBook Air 13" (M3)')).toEqual(['macbook', 'air', '13', 'm3']);
    expect(searchTokens('Café-Écran')).toEqual(['cafe', 'ecran']);
  });

  it('drops tsquery operators so input cannot alter the query', () => {
    expect(searchTokens("rtx & 4060 | !(x) <-> 'y':*")).toEqual(['rtx', '4060', 'x', 'y']);
  });

  it('returns nothing for symbol-only input and caps token count', () => {
    expect(searchTokens('!!! ---')).toEqual([]);
    expect(searchTokens('a b c d e f g h i j', 8)).toHaveLength(8);
  });
});
