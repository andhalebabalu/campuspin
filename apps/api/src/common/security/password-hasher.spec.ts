import { hashPassword, verifyPassword } from './password-hasher.js';

describe('password hashing', () => {
  it('produces an Argon2id hash that never contains the password', async () => {
    const hash = await hashPassword('ChangeMe123!');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain('m=19456,t=2,p=1');
    expect(hash).not.toContain('ChangeMe123!');
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'correct horse battery stapl')).resolves.toBe(false);
    await expect(verifyPassword(hash, '')).resolves.toBe(false);
  });

  it('salts every hash, so equal passwords give different hashes', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);

    expect(a).not.toBe(b);
    await expect(verifyPassword(a, 'same-password')).resolves.toBe(true);
    await expect(verifyPassword(b, 'same-password')).resolves.toBe(true);
  });

  it('treats a malformed stored hash as a failed login instead of throwing', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
    await expect(verifyPassword('', 'anything')).resolves.toBe(false);
  });
});
