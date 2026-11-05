import argon2 from 'argon2';

/** OWASP Password Storage Cheat Sheet: Argon2id, m=19 MiB, t=2, p=1. */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

let dummyHash: Promise<string> | null = null;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

/**
 * Verify a password. When there is no stored hash (unknown email or no password set), a dummy
 * hash is still verified so the response time does not reveal whether the account exists.
 */
export async function verifyPassword(
  storedHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!storedHash) {
    dummyHash ??= argon2.hash('dummy-password-for-timing', OPTIONS);
    await argon2.verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
}

/** True when the stored hash uses weaker parameters than today's and should be upgraded on login. */
export function needsRehash(storedHash: string): boolean {
  return argon2.needsRehash(storedHash, OPTIONS);
}
