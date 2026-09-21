import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  emailSchema,
  forgotPasswordRequestSchema,
  isCommonPassword,
  loginRequestSchema,
  nameSchema,
  passwordContainsEmailName,
  passwordProblems,
  passwordSchema,
  refreshRequestSchema,
  registerRequestSchema,
  resendVerificationRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
} from './index.js';

// Deliberately NOT "Str0ng!Passw0rd": the policy sees "Passw0rd" as the leet spelling of "password".
const STRONG = 'Blue!Lantern88Sky';

describe('emailSchema', () => {
  it('trims and lower-cases so one address is one account', () => {
    expect(emailSchema.parse('  Student@Example.COM ')).toBe('student@example.com');
  });

  it('rejects malformed and over-long addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@example.com`).success).toBe(false);
  });
});

describe('password policy', () => {
  it('accepts a strong password and a long passphrase', () => {
    expect(passwordProblems(STRONG)).toEqual([]);
    expect(passwordProblems('correct horse battery staple')).toEqual([]);
  });

  it('rejects short passwords', () => {
    expect(passwordProblems('Ab1!xyz')).toContain('Use at least 10 characters');
  });

  it('requires a mix of character classes below the passphrase length', () => {
    expect(passwordProblems('alllowercaseletters')).toEqual([]); // 19 chars: passphrase rule
    expect(passwordProblems('alllower12')).toEqual(
      expect.arrayContaining([expect.stringMatching(/Mix at least three/)]),
    );
  });

  it('rejects passwords made of very few distinct characters', () => {
    expect(passwordProblems('aaaAAA1111')).toContain('Use at least 5 different characters');
  });

  it.each([
    'Password123!',
    'P@ssw0rd!!',
    'qwerty12345',
    'Welcome@2024',
    'ChangeMe123!',
    'Admin@12345',
    'iloveyou#1A',
    'MyPassword#9271',
  ])('rejects the common password %s however it is decorated', (password) => {
    expect(isCommonPassword(password)).toBe(true);
    expect(passwordProblems(password)).toContain('This password is too common or easy to guess');
  });

  it('does not reject unrelated strong passwords', () => {
    expect(isCommonPassword(STRONG)).toBe(false);
    expect(isCommonPassword('Tr1cky-Mango-Sky')).toBe(false);
  });

  it('rejects an over-long password (protects the hasher from huge inputs)', () => {
    expect(passwordSchema.safeParse(`Aa1!${'x'.repeat(200)}`).success).toBe(false);
  });

  it('detects the email name inside the password', () => {
    expect(passwordContainsEmailName('Ashapatil#2024', 'ashapatil@example.com')).toBe(true);
    expect(passwordContainsEmailName('Asha.Patil-99', 'asha.patil@example.com')).toBe(true);
    expect(passwordContainsEmailName('Unrelated#Secret9', 'ashapatil@example.com')).toBe(false);
    // Very short names would flag too many innocent passwords.
    expect(passwordContainsEmailName('Abc#Password9', 'abc@example.com')).toBe(false);
  });
});

describe('registerRequestSchema', () => {
  const valid = { name: 'Asha Patil', email: 'Asha@Example.com', password: STRONG };

  it('normalises the email and whitespace in the name', () => {
    const parsed = registerRequestSchema.parse({ ...valid, name: '  Asha   Patil ' });
    expect(parsed).toEqual({ name: 'Asha Patil', email: 'asha@example.com', password: STRONG });
  });

  it('accepts names in other scripts', () => {
    expect(registerRequestSchema.safeParse({ ...valid, name: 'आशा पाटील' }).success).toBe(true);
  });

  it('rejects markup and control characters in the name', () => {
    expect(
      registerRequestSchema.safeParse({ ...valid, name: '<script>alert(1)</script>' }).success,
    ).toBe(false);
    const nul = String.fromCharCode(0);
    expect(registerRequestSchema.safeParse({ ...valid, name: `Asha${nul}Patil` }).success).toBe(
      false,
    );
    // A right-to-left override can make a name render as something else.
    const rlo = String.fromCodePoint(0x202e);
    expect(registerRequestSchema.safeParse({ ...valid, name: `Asha${rlo}Patil` }).success).toBe(
      false,
    );
  });

  it('allows a zero-width joiner, which some Indic names need', () => {
    const zwj = String.fromCodePoint(0x200d);
    expect(registerRequestSchema.safeParse({ ...valid, name: `क्${zwj}ष` }).success).toBe(true);
  });

  it('reports a weak password against the `password` field', () => {
    const result = registerRequestSchema.safeParse({ ...valid, password: 'password1' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.every((issue) => issue.path[0] === 'password')).toBe(true);
  });

  it('reports a password containing the email name against the `password` field', () => {
    const result = registerRequestSchema.safeParse({
      ...valid,
      email: 'ashapatil@example.com',
      password: 'Ashapatil#2024',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['password']);
  });
});

describe('loginRequestSchema', () => {
  it('does not apply the strength policy to a presented password', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'a@example.com', password: 'ChangeMe123!' }).success,
    ).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'a@example.com', password: 'x' }).success).toBe(
      true,
    );
  });

  it('requires both fields', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@example.com' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ email: 'a@example.com', password: '' }).success).toBe(
      false,
    );
  });
});

describe('resetPasswordRequestSchema', () => {
  it('requires a token and a strong new password', () => {
    const token = 'x'.repeat(43);
    expect(resetPasswordRequestSchema.safeParse({ token, newPassword: STRONG }).success).toBe(true);
    expect(resetPasswordRequestSchema.safeParse({ token, newPassword: 'weak' }).success).toBe(
      false,
    );
    expect(
      resetPasswordRequestSchema.safeParse({ token: 'short', newPassword: STRONG }).success,
    ).toBe(false);
  });
});

describe('documented examples', () => {
  const example = (schema: { meta: () => unknown }): unknown =>
    (schema.meta() as { example?: unknown } | undefined)?.example;

  it('every request example is accepted by its own schema (docs cannot drift into invalid samples)', () => {
    const email = example(emailSchema);
    const password = example(passwordSchema);
    const name = example(nameSchema);
    expect([email, password, name].every((value) => typeof value === 'string')).toBe(true);

    expect(registerRequestSchema.safeParse({ name, email, password }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email, password }).success).toBe(true);
    expect(forgotPasswordRequestSchema.safeParse({ email }).success).toBe(true);
    expect(resendVerificationRequestSchema.safeParse({ email }).success).toBe(true);

    const token = example(verifyEmailRequestSchema.shape.token);
    expect(verifyEmailRequestSchema.safeParse({ token }).success).toBe(true);
    expect(resetPasswordRequestSchema.safeParse({ token, newPassword: password }).success).toBe(
      true,
    );

    const refreshToken = example(refreshRequestSchema.shape.refreshToken);
    expect(refreshRequestSchema.safeParse({ refreshToken }).success).toBe(true);
  });
});

describe('auth error codes', () => {
  it('are part of the shared code list', () => {
    expect(ERROR_CODES).toEqual(
      expect.arrayContaining([
        'INVALID_CREDENTIALS',
        'EMAIL_NOT_VERIFIED',
        'ACCOUNT_SUSPENDED',
        'ACCOUNT_DEACTIVATED',
        'EMAIL_ALREADY_REGISTERED',
        'TOKEN_INVALID',
        'TOKEN_EXPIRED',
      ]),
    );
  });
});
