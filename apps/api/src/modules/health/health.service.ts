import { Injectable, Logger } from '@nestjs/common';
import type { DatabaseHealth, Health } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { withTimeout } from '../../common/utils/with-timeout.js';
import { AppConfig } from '../../infra/config/app-config.js';
import {
  type DatabaseFailureReason,
  classifyDatabaseError,
  probeDatabase,
} from '../../infra/database/database-probe.js';
import { parseDatabaseUrl } from '../../infra/database/database-url.js';
import { PrismaService } from '../../infra/database/prisma.service.js';

/** A health check must answer quickly even when the database is down (clients time out at 15 s). */
const DATABASE_CHECK_TIMEOUT_MS = 2_500;

/** `/health` is polled often: remember the database state briefly instead of querying every time. */
const DATABASE_STATE_TTL_MS = 5_000;
const DATABASE_STATE_TIMEOUT_MS = 1_500;

type DatabaseState = Health['database'];

const HINTS: Readonly<Record<DatabaseFailureReason, string>> = {
  SERVER_UNREACHABLE:
    'MySQL is not reachable. Start MySQL in the XAMPP Control Panel and check the host and port in DATABASE_URL.',
  ACCESS_DENIED: 'MySQL rejected the user or password in DATABASE_URL.',
  DATABASE_NOT_FOUND:
    'MySQL is running, but the database does not exist yet. Create it first (README: "Create the database").',
  TIMEOUT: 'MySQL did not answer in time. Check that it is running and not overloaded.',
  UNKNOWN: 'The database check failed. See the API logs for details.',
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private cachedState: { checkedAt: number; state: Promise<DatabaseState> } | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Liveness plus a database indicator. A stopped database does not make the API "down": the
   * process is running, so the status stays `ok` and the database is reported separately.
   */
  async getStatus(): Promise<Health> {
    return { status: 'ok', database: await this.databaseState() };
  }

  /** One query through Prisma (the path the application really uses), shared by concurrent callers. */
  private databaseState(): Promise<DatabaseState> {
    const now = Date.now();
    if (this.cachedState && now - this.cachedState.checkedAt < DATABASE_STATE_TTL_MS) {
      return this.cachedState.state;
    }
    const state = this.queryDatabaseState();
    this.cachedState = { checkedAt: now, state };
    return state;
  }

  private async queryDatabaseState(): Promise<DatabaseState> {
    try {
      await withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        DATABASE_STATE_TIMEOUT_MS,
        `no answer within ${DATABASE_STATE_TIMEOUT_MS} ms`,
      );
      return 'connected';
    } catch (error) {
      this.logger.debug(
        `Database state check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'unavailable';
    }
  }

  /**
   * Detailed readiness. A direct connection explains *why* the database is unusable (missing
   * database, refused, ...), then a query through Prisma proves the path the application uses.
   */
  async checkDatabase(): Promise<DatabaseHealth> {
    try {
      const server = await probeDatabase(
        parseDatabaseUrl(this.config.databaseUrl),
        DATABASE_CHECK_TIMEOUT_MS,
      );
      await withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        DATABASE_CHECK_TIMEOUT_MS,
        `no answer within ${DATABASE_CHECK_TIMEOUT_MS} ms`,
      );
      return { status: 'ok', database: server.database, serverVersion: server.serverVersion };
    } catch (error) {
      const reason = classifyDatabaseError(error);
      const cause = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Database health check failed for ${this.config.databaseTarget} (${reason}): ${cause}`,
      );
      // Outside production be specific; in production do not tell anonymous callers why.
      throw this.config.isProduction
        ? AppException.databaseUnavailable('The database is not reachable.')
        : AppException.databaseUnavailable(HINTS[reason], {
            reason,
            target: this.config.databaseTarget,
          });
    }
  }
}
