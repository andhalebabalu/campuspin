import { z } from 'zod';
import { collegeRefSchema, studentBadgeSchema } from './members.js';
import { permissionKeySchema, roleKeySchema } from './rbac.js';
import { multiLineField, phoneSchema, singleLineField, uuidSchema } from './text.js';

/**
 * Authentication contracts: request bodies, response data and the password policy. The API
 * validates with these schemas, Swagger documents from them, and the web/mobile forms reuse the
 * same rules, so a password accepted by a form is never rejected by the server for a rule the form
 * did not know about.
 */

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
/** A password this long needs no character-class mix (a passphrase is strong by length alone). */
export const PASSPHRASE_LENGTH = 16;

// ── Password policy ──────────────────────────────────────────────────────────────────────────────

/** Whole passwords that are weak even when decorated ("Password123!" reduces to "password"). */
const COMMON_ROOTS = new Set([
  'password',
  'passcode',
  'qwerty',
  'qwertyuiop',
  'asdfgh',
  'asdfghjkl',
  'zxcvbn',
  'letmein',
  'welcome',
  'iloveyou',
  'changeme',
  'admin',
  'administrator',
  'root',
  'login',
  'secret',
  'master',
  'monkey',
  'dragon',
  'football',
  'cricket',
  'abcdef',
  'abcdefgh',
  'student',
  'college',
  'india',
  'ahilyanagar',
  'ahmednagar',
  'link',
  'linku',
]);

/** Fragments that make a password weak wherever they appear inside it. */
const BANNED_FRAGMENTS = [
  'password',
  'qwerty',
  'letmein',
  'iloveyou',
  'welcome',
  'changeme',
  '123456',
  '654321',
  'abcdef',
];

const LEET: Readonly<Record<string, string>> = {
  '@': 'a',
  '4': 'a',
  '0': 'o',
  '1': 'i',
  '!': 'i',
  $: 's',
  '5': 's',
  '3': 'e',
  '7': 't',
};

function unleet(value: string): string {
  return [...value].map((char) => LEET[char] ?? char).join('');
}

/** Removes the digits/symbols people add around a weak word. */
function stripEdges(value: string): string {
  return value.replace(/^[^a-z]+|[^a-z]+$/g, '');
}

/**
 * True for passwords that are obviously weak: a common word (however it is decorated with digits,
 * symbols or leet substitutions such as `p@ssw0rd`) or one containing a well-known weak fragment.
 * A short deny-list, not a breach database: it stops the passwords people try first, and length
 * plus the class rules do the rest.
 */
export function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase();
  const candidates = new Set([
    lower,
    stripEdges(lower),
    stripEdges(unleet(lower)),
    unleet(stripEdges(lower)),
  ]);
  for (const candidate of candidates) {
    if (COMMON_ROOTS.has(candidate)) return true;
    if (BANNED_FRAGMENTS.some((fragment) => candidate.includes(fragment))) return true;
  }
  return false;
}

/** True when the password contains the part of the email before the `@` (4+ characters). */
export function passwordContainsEmailName(password: string, email: string): boolean {
  const alphanumeric = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = alphanumeric(email.split('@')[0] ?? '');
  return name.length >= 4 && alphanumeric(password).includes(name);
}

/** Every rule the password breaks, as messages a person can act on. Empty means acceptable. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((rule) =>
    rule.test(password),
  ).length;
  if (password.length < PASSPHRASE_LENGTH && classes < 3) {
    problems.push(
      'Mix at least three of: lowercase letters, uppercase letters, numbers and symbols ' +
        `(or use a passphrase of ${PASSPHRASE_LENGTH}+ characters)`,
    );
  }
  if (new Set(password).size < 5) {
    problems.push('Use at least 5 different characters');
  }
  if (isCommonPassword(password)) {
    problems.push('This password is too common or easy to guess');
  }
  return problems;
}

// ── Field schemas ────────────────────────────────────────────────────────────────────────────────

/** Trimmed and lower-cased, so `Student@Example.com ` and `student@example.com` are one account. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(EMAIL_MAX_LENGTH))
  .meta({ example: 'student@example.com' });

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your name')
  .max(120, 'Use at most 120 characters')
  // Markup, control characters and bidi overrides (used to spoof names) have no place in a display
  // name. Zero-width joiners stay allowed: some Indic names need them.
  .regex(
    /^[^<>\p{Cc}\p{Cs}\p{Co}\p{Bidi_Control}]+$/u,
    'The name contains characters that are not allowed',
  )
  .transform((value) => value.replace(/\s+/g, ' '))
  .meta({ example: 'Asha Patil' });

/** The rules for choosing a NEW password (register, reset). Login does not apply them. */
export const passwordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)
  .check((ctx) => {
    for (const message of passwordProblems(ctx.value)) {
      ctx.issues.push({ code: 'custom', message, input: ctx.value });
    }
  })
  .meta({ example: 'Correct-Horse-42' });

/** A one-time token from an email link (43 URL-safe characters today; the bound leaves headroom). */
const emailTokenSchema = z
  .string()
  .trim()
  .min(20)
  .max(512)
  .meta({ example: 'p3Yb1xQe7W2m9Zk5LrT8vN4cA6hJ0dFsUoGiEqXyBnM' });

// ── Requests ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Who is signing up. `STUDENT` gets the STUDENT role; `BUSINESS` gets BUSINESS_OWNER plus a business
 * profile (name, category, phone, city). Only these two are self-service: staff roles are never
 * chosen here, and one account is never both.
 */
export const ACCOUNT_TYPES = ['STUDENT', 'BUSINESS'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);

export const registerRequestSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    accountType: accountTypeSchema.default('STUDENT'),
    /** Student only, optional: the college they study at (browsing preference, not verification). */
    collegeId: uuidSchema.optional(),
    // Business only; required for a `BUSINESS` account, ignored for a `STUDENT` one.
    businessName: singleLineField('Business name', 200)
      .optional()
      .meta({ example: 'Sai Krupa Mess' }),
    /** A top-level category (Mess, PG, Library...). */
    categoryId: uuidSchema.optional(),
    phone: phoneSchema.optional(),
    city: singleLineField('City', 100).optional().meta({ example: 'Ahilyanagar' }),
    description: multiLineField('Description', 1000).optional(),
  })
  .check((ctx) => {
    if (passwordContainsEmailName(ctx.value.password, ctx.value.email)) {
      ctx.issues.push({
        code: 'custom',
        message: 'The password must not contain the name part of your email',
        input: ctx.value.password,
        path: ['password'],
      });
    }
    if (ctx.value.accountType === 'BUSINESS') {
      const required = [
        ['businessName', 'Enter your business name'],
        ['categoryId', 'Choose what kind of business it is'],
        ['phone', 'Enter a phone number students can call'],
        ['city', 'Enter your city'],
      ] as const;
      for (const [field, message] of required) {
        if (!ctx.value[field]) {
          ctx.issues.push({ code: 'custom', message, input: ctx.value[field], path: [field] });
        }
      }
    }
  });
export type RegisterRequest = z.output<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  // The strength policy applies when choosing a password, never when presenting one.
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.output<typeof loginRequestSchema>;

export const verifyEmailRequestSchema = z.object({ token: emailTokenSchema });
export type VerifyEmailRequest = z.output<typeof verifyEmailRequestSchema>;

export const resendVerificationRequestSchema = z.object({ email: emailSchema });
export type ResendVerificationRequest = z.output<typeof resendVerificationRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().trim().min(20).max(2048).meta({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTk5YzNiMi03ZDQxIiwic2lkIjoiOWYyYzEifQ.c2lnbmF0dXJl',
  }),
});
export type RefreshRequest = z.output<typeof refreshRequestSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export type ForgotPasswordRequest = z.output<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: emailTokenSchema,
  newPassword: passwordSchema,
});
export type ResetPasswordRequest = z.output<typeof resetPasswordRequestSchema>;

// ── Responses (the `data` of the standard envelope) ──────────────────────────────────────────────

/** The signed-in user as clients see it. Never contains hashes, tokens or status internals. */
export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  roles: z.array(roleKeySchema),
  permissions: z.array(permissionKeySchema),
  /** The college chosen for browsing (grants nothing). */
  college: collegeRefSchema.nullable(),
  /** Verified-student standing: what community and marketplace access depend on. */
  student: studentBadgeSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const registerResponseSchema = z.object({
  user: authUserSchema.omit({ permissions: true }),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: authUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

export const verifyEmailResponseSchema = z.object({ emailVerified: z.literal(true) });
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;
