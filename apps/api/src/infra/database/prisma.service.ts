import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client.js';
import { AppConfig } from '../config/app-config.js';
import { createMariaDbAdapter } from './mariadb-adapter.js';

/**
 * The single gateway to MySQL/MariaDB for the whole API: every module injects this service, and no
 * module opens its own connection. Prisma 7 requires a driver adapter; XAMPP's MariaDB is reached
 * through `@prisma/adapter-mariadb`.
 *
 * The connection is opened lazily on the first query, so the API can start (and serve /health)
 * even when the database server is not running yet.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({ adapter: createMariaDbAdapter(config.databaseUrl) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
