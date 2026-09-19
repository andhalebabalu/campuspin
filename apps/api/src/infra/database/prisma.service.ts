import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client.js';
import { AppConfig } from '../config/app-config.js';
import { parseDatabaseUrl } from './database-url.js';

/**
 * The single gateway to MySQL/MariaDB. Prisma 7 requires a driver adapter; XAMPP's MariaDB is
 * reached through `@prisma/adapter-mariadb`.
 *
 * The connection is opened lazily on the first query, so the API can start (and serve /health)
 * even when the database server is not running yet.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    const { host, port, user, password, database } = parseDatabaseUrl(config.databaseUrl);
    super({
      adapter: new PrismaMariaDb({
        host,
        port,
        user,
        password,
        database,
        connectionLimit: 10,
        // Fail fast when the server is down (e.g. XAMPP MySQL not started) instead of hanging
        // requests: bound opening a connection, waiting for a pooled one, and pool start-up.
        connectTimeout: 3_000,
        acquireTimeout: 3_000,
        initializationTimeout: 3_000,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
