import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id with the OWASP-recommended minimum parameters (19 MiB memory, 2 passes, 1 lane).
 * The algorithm is the library default (Argon2id); the parameters are pinned here so an upgrade
 * of the library can never silently weaken new hashes. The salt is random per hash and is stored
 * inside the encoded string, so nothing else needs to be saved.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

/** Returns false (never throws) for a wrong password or a malformed stored hash. */
export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}
