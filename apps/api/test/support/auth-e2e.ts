import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, apiSuccessSchema } from '@platform/contracts';
import request from 'supertest';
import type { z } from 'zod';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { EmailProvider } from '../../src/infra/email/email-provider.js';
import { MemoryEmailProvider } from '../../src/infra/email/memory-email.provider.js';
import { createDb } from './db.js';
import { createTestApp } from './create-test-app.js';

/** Every account these tests create lives under this reserved domain, so cleanup can never touch a real user. */
export const TEST_EMAIL_DOMAIN = 'auth-e2e.localhost.test';
/** Every request carries an id starting with this, so cleanup can find the audit rows it caused. */
const REQUEST_ID_PREFIX = 'e2eauth';
/**
 * Colleges and places the e2e tests create have slugs starting with these, so cleanup can find them.
 * (A college slug comes from its name, and the tests name their colleges "E2E ...".)
 */
export const TEST_COLLEGE_SLUG_PREFIX = 'e2e-';
export const TEST_PLACE_SLUG_PREFIX = 'e2e-place-';
export const TEST_CATEGORY_SLUG_PREFIX = 'e2e-cat-';
/** Amenity, attribute and rating-dimension keys are machine keys (letters/digits/underscore only). */
export const TEST_KEY_PREFIX = 'e2e_test_';

/** Passes the password policy, does not contain the email name, and is not a common word. */
export const STRONG_PASSWORD = 'Blue!Lantern88Sky';
export const NEW_STRONG_PASSWORD = 'Amber-Falcon-2027!x';

export const testEmail = (label = 'user'): string =>
  `${label}-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;

/**
 * Deletes what the e2e tests created, and only that: users under the reserved domain (their tokens
 * and role links cascade), audit rows tagged with the test request-id prefix or belonging to those
 * users, and test colleges and places (identified by their reserved slug prefixes; their images and
 * college-place links cascade). Places go first because a place must not outlive its creator's row.
 * Safe to run before AND after the suite.
 */
export async function removeAuthTestData(db: PrismaClient): Promise<void> {
  const users = await db.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  await db.auditLog.deleteMany({
    where: {
      OR: [
        { requestId: { startsWith: REQUEST_ID_PREFIX } },
        ...(ids.length > 0 ? [{ actorId: { in: ids } }, { entityId: { in: ids } }] : []),
      ],
    },
  });
  // Submissions have no slug of their own to filter by; every one made in these tests was made BY a
  // test user, and must go before that user (`submittedById` is RESTRICT) and before the place it
  // created (`resultingPlaceId` is SET NULL on the submission, which would otherwise orphan it).
  if (ids.length > 0) {
    await db.placeSubmission.deleteMany({ where: { submittedById: { in: ids } } });
  }
  // Reviews block deleting both their author and their place (RESTRICT on each), so they go first:
  // any review by a test user, and any review of a test place. Dimension ratings cascade.
  await db.review.deleteMany({
    where: {
      OR: [
        ...(ids.length > 0 ? [{ userId: { in: ids } }] : []),
        { place: { slug: { startsWith: TEST_PLACE_SLUG_PREFIX } } },
      ],
    },
  });
  await db.place.deleteMany({ where: { slug: { startsWith: TEST_PLACE_SLUG_PREFIX } } });
  await db.college.deleteMany({ where: { slug: { startsWith: TEST_COLLEGE_SLUG_PREFIX } } });
  // A business profile blocks deleting its owner (RESTRICT). Its enquiries cascade with it; its
  // places were test places, removed just above.
  if (ids.length > 0) await db.businessProfile.deleteMany({ where: { ownerId: { in: ids } } });
  // A category's attributes and rating dimensions cascade with it, but a group with a child still
  // in it is protected by a foreign key (RESTRICT), so children are removed before their groups.
  const categoryFilter = { slug: { startsWith: TEST_CATEGORY_SLUG_PREFIX } };
  await db.category.deleteMany({ where: { ...categoryFilter, parentId: { not: null } } });
  await db.category.deleteMany({ where: { ...categoryFilter, parentId: null } });
  await db.amenity.deleteMany({ where: { key: { startsWith: TEST_KEY_PREFIX } } });
  if (ids.length > 0) await db.user.deleteMany({ where: { id: { in: ids } } });
}

export interface AuthTestContext {
  app: NestExpressApplication;
  db: PrismaClient;
  mail: MemoryEmailProvider;
  get: (url: string) => request.Test;
  post: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  delete: (url: string) => request.Test;
  close: () => Promise<void>;
}

/** Boots the real app against the real database, with the in-memory outbox and tagged requests. */
export async function createAuthTestContext(
  extras: Parameters<typeof createTestApp>[0] = {},
): Promise<AuthTestContext> {
  const db = createDb();
  await removeAuthTestData(db);

  const app = await createTestApp(extras);
  const mail = app.get(EmailProvider);
  if (!(mail instanceof MemoryEmailProvider)) {
    throw new Error('Auth e2e tests need EMAIL_PROVIDER=memory (set by vitest.config.e2e-db.ts).');
  }

  const server = app.getHttpServer();
  let counter = 0;
  // Real clients send a User-Agent; supertest does not, and the audit trail records it.
  const tag = (test: request.Test): request.Test =>
    test
      .set('X-Request-Id', `${REQUEST_ID_PREFIX}-${randomUUID().slice(0, 8)}-${(counter += 1)}`)
      .set('User-Agent', 'platform-e2e-tests');

  return {
    app,
    db,
    mail,
    get: (url) => tag(request(server).get(url)),
    post: (url) => tag(request(server).post(url)),
    patch: (url) => tag(request(server).patch(url)),
    delete: (url) => tag(request(server).delete(url)),
    close: async () => {
      await app.close();
      await removeAuthTestData(db);
      await db.$disconnect();
    },
  };
}

/** The one-time token in the most recent email to an address (from the link the user would click). */
export function tokenFromLatestEmail(mail: MemoryEmailProvider, to: string): string {
  const email = mail.latestTo(to);
  const match = email ? /[?&]token=([^\s&"<]+)/.exec(email.text) : null;
  if (!match?.[1]) throw new Error(`No email with a token link was sent to ${to}`);
  return decodeURIComponent(match[1]);
}

export const bearer = (token: string): string => `Bearer ${token}`;

/** Parses a success response through the shared contract, so a wrong shape fails the test. */
export const successOf = <T extends z.ZodType>(schema: T, response: request.Response) =>
  apiSuccessSchema(schema).parse(response.body);

/** Parses an error response through the shared error contract. */
export const errorOf = (response: request.Response) => apiErrorSchema.parse(response.body);

/** The audit rows written while serving one request (found by the request id the server echoed). */
export function auditRowsFor(db: PrismaClient, response: request.Response) {
  return db.auditLog.findMany({
    where: { requestId: String(response.headers['x-request-id']) },
    orderBy: { createdAt: 'asc' },
  });
}

/** Reads the (unverified) payload of a JWT, to assert what it does and does not contain. */
export function jwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** Registers an account and completes email verification, as a real user would. */
export async function registerAndVerify(
  ctx: AuthTestContext,
  options: {
    label?: string;
    password?: string;
    name?: string;
    /** Sign up as a business (BUSINESS_OWNER with a business profile of this name). */
    businessName?: string;
  } = {},
): Promise<{ email: string; password: string; userId: string }> {
  const email = testEmail(options.label);
  const password = options.password ?? STRONG_PASSWORD;
  const registered = await ctx
    .post('/api/v1/auth/register')
    .send({
      name: options.name ?? 'Test Student',
      email,
      password,
      ...(options.businessName
        ? { accountType: 'BUSINESS', businessName: options.businessName }
        : {}),
    })
    .expect(201);
  await ctx
    .post('/api/v1/auth/verify-email')
    .send({ token: tokenFromLatestEmail(ctx.mail, email) })
    .expect(200);
  return {
    email,
    password,
    userId: (registered.body as { data: { user: { id: string } } }).data.user.id,
  };
}

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export async function login(
  ctx: AuthTestContext,
  credentials: { email: string; password: string },
): Promise<Session> {
  const response = await ctx.post('/api/v1/auth/login').send(credentials).expect(200);
  const { accessToken, refreshToken } = (response.body as { data: Session }).data;
  return { accessToken, refreshToken };
}

/** Gives a test user an extra role directly in the database (there is no admin API for it yet). */
export async function grantRole(db: PrismaClient, userId: string, roleKey: string): Promise<void> {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey }, select: { id: true } });
  await db.userRole.create({ data: { userId, roleId: role.id } });
}
