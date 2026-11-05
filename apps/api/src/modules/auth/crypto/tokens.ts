import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit random token, base64url (43 characters). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are stored as SHA-256 digests; a database leak does not reveal usable tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
