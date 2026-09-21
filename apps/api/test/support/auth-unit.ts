import { JwtService } from '@nestjs/jwt';
import type { RoleKey } from '@platform/contracts';
import { hashPassword } from '../../src/common/security/password-hasher.js';
import type { ClientContext } from '../../src/common/http/request-client.decorator.js';
import type { AppException } from '../../src/common/http/app-exception.js';
import { AppConfig } from '../../src/infra/config/app-config.js';
import type { PrismaService } from '../../src/infra/database/prisma.service.js';
import type { EmailService } from '../../src/infra/email/email.service.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { EmailVerificationService } from '../../src/modules/auth/services/email-verification.service.js';
import { PasswordResetService } from '../../src/modules/auth/services/password-reset.service.js';
import { RbacService } from '../../src/modules/auth/services/rbac.service.js';
import { SessionService } from '../../src/modules/auth/services/session.service.js';
import { TokenService } from '../../src/modules/auth/services/token.service.js';
import { FakePrisma, type Row } from './fake-prisma.js';

export const STRONG = 'Blue!Lantern88Sky';
export const OTHER_STRONG = 'Amber-Falcon-2027!x';

export const CLIENT: ClientContext = {
  ipAddress: '203.0.113.7',
  userAgent: 'vitest-agent',
  requestId: 'req-unit-0001',
};

interface SentEmail {
  kind: 'verification' | 'reset';
  to: string;
  name: string;
  token: string;
}

/** Records emails instead of rendering them. `failWith` makes the next sends fail. */
export class FakeEmailService {
  readonly sent: SentEmail[] = [];
  failWith: Error | undefined;

  sendVerificationEmail(input: { to: string; name: string; token: string }): Promise<void> {
    return this.record('verification', input);
  }

  sendPasswordResetEmail(input: { to: string; name: string; token: string }): Promise<void> {
    return this.record('reset', input);
  }

  latest(kind: SentEmail['kind']): SentEmail | undefined {
    return this.sent.findLast((email) => email.kind === kind);
  }

  private record(kind: SentEmail['kind'], input: Omit<SentEmail, 'kind'>): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push({ kind, ...input });
    return Promise.resolve();
  }
}

const BASE_ENV = {
  DATABASE_URL: 'mysql://root:@localhost:3306/unit_test',
  JWT_ACCESS_SECRET: 'unit-test-access-secret-0123456789abcdef-xxxx',
  JWT_REFRESH_SECRET: 'unit-test-refresh-secret-0123456789abcdef-yyy',
};

/** The real auth services wired to an in-memory database and a recording email service. */
export function buildAuthKit(env: Record<string, string> = {}) {
  const config = AppConfig.fromEnv({ ...BASE_ENV, ...env });
  const fake = new FakePrisma();
  const prisma = fake as unknown as PrismaService;
  const emails = new FakeEmailService();
  const emailService = emails as unknown as EmailService;

  const audit = new AuditService(prisma);
  const tokens = new TokenService(new JwtService(), config);
  const sessions = new SessionService(prisma, tokens, audit);
  const rbac = new RbacService(prisma);
  const verification = new EmailVerificationService(prisma, emailService, audit, config);
  const reset = new PasswordResetService(prisma, emailService, audit, sessions, config);
  const auth = new AuthService(prisma, tokens, sessions, rbac, audit, verification, reset);

  /** Inserts a user with a real Argon2id hash. Verified and active unless told otherwise. */
  async function seedUser(
    options: {
      email?: string;
      password?: string;
      roles?: RoleKey[];
      status?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
      verified?: boolean;
      name?: string;
    } = {},
  ): Promise<Row & { id: string; email: string; password: string }> {
    const password = options.password ?? STRONG;
    const email = options.email ?? `user-${fake.user.rows.length + 1}@example.test`;
    const created = await fake.user.create({
      data: {
        name: options.name ?? 'Seeded User',
        email,
        passwordHash: await hashPassword(password),
        status: options.status ?? 'ACTIVE',
        emailVerifiedAt: options.verified === false ? null : new Date(),
        roleIds: (options.roles ?? ['STUDENT']).map((key) => `role-${key}`),
      },
    });
    return { ...created, id: created.id as string, email, password };
  }

  /** The audit rows recorded so far, oldest first, reduced to what tests assert on. */
  const auditActions = (): string[] => fake.auditLog.rows.map((row) => row.action as string);

  return {
    config,
    fake,
    emails,
    audit,
    tokens,
    sessions,
    rbac,
    verification,
    reset,
    auth,
    seedUser,
    auditActions,
  };
}

/** Runs a promise that must reject with an `AppException` and returns it for inspection. */
export async function thrown(work: Promise<unknown>): Promise<AppException> {
  try {
    await work;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('Expected the promise to reject, but it resolved');
}
