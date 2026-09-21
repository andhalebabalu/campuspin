import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { databaseHealthSchema, healthSchema } from '@platform/contracts';
import type { DatabaseHealth, Health } from '@platform/contracts';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { HealthService } from './health.service.js';

// Probes must work without credentials (load balancers, uptime monitors, the web app's status badge).
@Public()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness plus a database indicator. Always 200 while the process runs; `database` says
   * whether MySQL currently answers (cached for a few seconds).
   */
  @Get()
  @SkipThrottle()
  @ResponseMessage('API is running')
  @ApiEnvelopeResponse(healthSchema, {
    description: 'The API process is running; `database` reports MySQL connectivity.',
  })
  check(): Promise<Health> {
    return this.health.getStatus();
  }

  /** Readiness: the database (XAMPP MySQL/MariaDB) answers a query. */
  @Get('database')
  @ResponseMessage('Database is reachable')
  @ApiEnvelopeResponse(databaseHealthSchema, { description: 'The database answered a query.' })
  @ApiErrorResponses(503)
  checkDatabase(): Promise<DatabaseHealth> {
    return this.health.checkDatabase();
  }
}
