import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from './tokens.js';

/** RFC 6238 TOTP (HMAC-SHA1, 30-second steps, 6 digits): what Google Authenticator and others use. */
export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit secret, base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
}

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totp(base32Secret: string, atMs: number = Date.now()): string {
  return hotp(base32Decode(base32Secret), timeStep(atMs));
}

/**
 * Checks the code against the current step and one step either side (clock drift).
 * Returns the matching step so callers can reject replays of the same code.
 */
export function verifyTotp(
  base32Secret: string,
  code: string,
  atMs: number = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(base32Secret);
  const current = timeStep(atMs);
  for (const step of [current, current - 1, current + 1]) {
    if (safeEqual(hotp(secret, step), code)) return step;
  }
  return null;
}

export function otpauthUrl(base32Secret: string, accountName: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: base32Secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
