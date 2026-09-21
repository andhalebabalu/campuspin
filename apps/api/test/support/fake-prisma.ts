import { randomUUID } from 'node:crypto';
import { ROLE_KEYS, ROLE_PERMISSIONS } from '@platform/contracts';

/**
 * A tiny in-memory stand-in for `PrismaService`, for UNIT tests of the auth services. It implements
 * only what those services call, with the semantics they rely on (equality, `null`, `lt`, `in` and
 * `OR` filters, unique indexes that raise Prisma's P2002, atomic `updateMany` compare-and-set).
 * It proves the business logic; the e2e-db suite proves it against the real MariaDB.
 */
export type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Where[]).some((branch) => matches(row, branch));
    const actual = row[key];
    if (isPlainObject(condition)) {
      if ('lt' in condition) {
        return actual instanceof Date && actual.getTime() < (condition.lt as Date).getTime();
      }
      if ('in' in condition) return (condition.in as unknown[]).includes(actual);
      throw new Error(`FakePrisma: unsupported filter on "${key}"`);
    }
    if (condition instanceof Date) {
      return actual instanceof Date && actual.getTime() === condition.getTime();
    }
    return actual === condition;
  });
}

export class FakeTable {
  readonly rows: Row[] = [];

  constructor(private readonly options: { defaults?: () => Row; unique?: string[] } = {}) {}

  create({ data }: { data: Row }): Promise<Row> {
    const row: Row = {
      id: randomUUID(),
      createdAt: new Date(),
      ...this.options.defaults?.(),
      ...data,
    };
    for (const field of this.options.unique ?? []) {
      if (this.rows.some((existing) => existing[field] === row[field])) {
        return Promise.reject(
          Object.assign(new Error(`Unique constraint failed on ${field}`), { code: 'P2002' }),
        );
      }
    }
    this.rows.push(row);
    return Promise.resolve(this.shape(row));
  }

  findUnique({ where }: { where: Where }): Promise<Row | null> {
    const row = this.rows.find((candidate) => matches(candidate, where));
    return Promise.resolve(row ? this.shape(row) : null);
  }

  findMany({ where = {} }: { where?: Where } = {}): Promise<Row[]> {
    return Promise.resolve(
      this.rows.filter((row) => matches(row, where)).map((row) => this.shape(row)),
    );
  }

  update({ where, data }: { where: Where; data: Row }): Promise<Row> {
    const row = this.rows.find((candidate) => matches(candidate, where));
    if (!row) return Promise.reject(new Error('Record to update not found'));
    Object.assign(row, data);
    return Promise.resolve(this.shape(row));
  }

  /** Synchronous inside, so it is atomic like a single SQL UPDATE: the basis of compare-and-set. */
  updateMany({ where, data }: { where: Where; data: Row }): Promise<{ count: number }> {
    const hits = this.rows.filter((row) => matches(row, where));
    for (const row of hits) Object.assign(row, data);
    return Promise.resolve({ count: hits.length });
  }

  deleteMany({ where = {} }: { where?: Where } = {}): Promise<{ count: number }> {
    const doomed = this.rows.filter((row) => matches(row, where));
    for (const row of doomed) this.rows.splice(this.rows.indexOf(row), 1);
    return Promise.resolve({ count: doomed.length });
  }

  protected shape(row: Row): Row {
    return { ...row };
  }
}

/** Users store role ids; reads expose them the way the services select them (`userRoles[].role.key`). */
class UserTable extends FakeTable {
  constructor(private readonly roles: FakeTable) {
    super({
      defaults: () => ({ status: 'ACTIVE', emailVerifiedAt: null, lastLoginAt: null, roleIds: [] }),
      unique: ['email'],
    });
  }

  override create({ data }: { data: Row }): Promise<Row> {
    const { userRoles, ...rest } = data as Row & { userRoles?: { create: { roleId: string } } };
    return super.create({
      data: { ...rest, ...(userRoles ? { roleIds: [userRoles.create.roleId] } : {}) },
    });
  }

  protected override shape(row: Row): Row {
    const roleIds = row.roleIds as string[];
    return {
      ...row,
      userRoles: roleIds.map((id) => ({
        role: { key: this.roles.rows.find((role) => role.id === id)?.key },
      })),
    };
  }
}

/** Reset tokens are read together with their user (`include: { user }`). */
class TokenWithUserTable extends FakeTable {
  constructor(private readonly users: FakeTable) {
    super({ defaults: () => ({ usedAt: null }), unique: ['tokenHash'] });
  }

  protected override shape(row: Row): Row {
    const user = this.users.rows.find((candidate) => candidate.id === row.userId);
    return { ...row, user: user ? { id: user.id, email: user.email } : null };
  }
}

export class FakePrisma {
  readonly role = new FakeTable({ unique: ['key'] });
  readonly user = new UserTable(this.role);
  readonly refreshToken = new FakeTable({
    defaults: () => ({
      revokedAt: null,
      revokedReason: null,
      lastUsedAt: null,
      userAgent: null,
      ipAddress: null,
    }),
    unique: ['tokenHash'],
  });
  readonly emailVerificationToken = new FakeTable({
    defaults: () => ({ usedAt: null }),
    unique: ['tokenHash'],
  });
  readonly passwordResetToken = new TokenWithUserTable(this.user);
  readonly auditLog = new FakeTable();
  /** Counts queries, so tests can prove the role grants are cached. */
  readonly rolePermission = {
    findMany: (): Promise<Array<{ role: { key: string }; permission: { key: string } }>> =>
      Promise.resolve(
        ROLE_KEYS.flatMap((role) =>
          ROLE_PERMISSIONS[role].map((permission) => ({
            role: { key: role },
            permission: { key: permission },
          })),
        ),
      ),
  };

  constructor() {
    for (const key of ROLE_KEYS) this.role.rows.push({ id: `role-${key}`, key });
  }

  $transaction<T>(work: ((tx: FakePrisma) => Promise<T>) | Array<Promise<unknown>>): Promise<T> {
    // No rollback is simulated; the services' invariants do not depend on it in unit tests.
    return typeof work === 'function' ? work(this) : (Promise.all(work) as Promise<T>);
  }
}
