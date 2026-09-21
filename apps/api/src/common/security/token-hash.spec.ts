import { fingerprint, generateOpaqueToken, hashToken } from './token-hash.js';

describe('generateOpaqueToken', () => {
  it('produces 43 URL-safe characters (256 bits)', () => {
    expect(generateOpaqueToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(500);
  });
});

describe('hashToken', () => {
  it('is a deterministic 64-character hex SHA-256', () => {
    const hash = hashToken('example-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('example-token')).toBe(hash);
  });

  it('matches the well-known SHA-256 test vector', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('never contains the raw token', () => {
    const raw = generateOpaqueToken();
    expect(hashToken(raw)).not.toContain(raw);
  });

  it('gives different hashes for different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('fingerprint', () => {
  it('is a short stable identifier that does not reveal the value', () => {
    expect(fingerprint('student@example.com')).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint('student@example.com')).toBe(fingerprint('student@example.com'));
    expect(fingerprint('student@example.com')).not.toContain('student');
  });
});
