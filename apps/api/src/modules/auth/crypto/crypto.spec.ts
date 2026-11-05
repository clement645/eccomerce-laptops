import { hashPassword, needsRehash, verifyPassword } from './password.js';
import { SecretBox } from './secret-box.js';
import { hashToken, randomToken } from './tokens.js';
import { base32Decode, base32Encode, hotp, otpauthUrl, totp, verifyTotp } from './totp.js';

describe('password hashing', () => {
  it('uses Argon2id and verifies correctly', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it('returns false for missing or malformed hashes without throwing', async () => {
    expect(await verifyPassword(null, 'anything')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});

describe('tokens', () => {
  it('generates unique 256-bit tokens and stable hashes', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).toBe(hashToken(token));
  });
});

describe('SecretBox', () => {
  const box = new SecretBox(Buffer.alloc(32, 1).toString('base64'));

  it('round-trips and uses a fresh IV each time', () => {
    const a = box.encrypt('JBSWY3DPEHPK3PXP');
    expect(box.decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
    expect(box.encrypt('JBSWY3DPEHPK3PXP')).not.toBe(a);
  });

  it('rejects tampering and the wrong key', () => {
    const encrypted = box.encrypt('secret');
    const parts = encrypted.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
    expect(() =>
      new SecretBox(Buffer.alloc(32, 2).toString('base64')).decrypt(encrypted),
    ).toThrow();
  });
});

describe('TOTP (RFC 6238 / RFC 4226 test vectors)', () => {
  const rfcSecret = Buffer.from('12345678901234567890');

  it('matches the RFC 4226 HOTP vectors', () => {
    expect([0, 1, 2, 3].map((c) => hotp(rfcSecret, c))).toEqual([
      '755224',
      '287082',
      '359152',
      '969429',
    ]);
  });

  it('matches RFC 6238 SHA-1 vectors (8 digits)', () => {
    expect(hotp(rfcSecret, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(hotp(rfcSecret, Math.floor(1111111109 / 30), 8)).toBe('07081804');
  });

  it('round-trips base32', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
  });

  it('accepts the current and adjacent steps only', () => {
    const secret = base32Encode(rfcSecret);
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, now), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('builds an authenticator URI', () => {
    expect(otpauthUrl('ABC', 'jane@example.com', 'Laptops & Electronics')).toBe(
      'otpauth://totp/Laptops%20%26%20Electronics%3Ajane%40example.com?secret=ABC&issuer=Laptops+%26+Electronics&algorithm=SHA1&digits=6&period=30',
    );
  });
});
