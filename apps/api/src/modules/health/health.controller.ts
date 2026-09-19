import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { databaseHealthSchema, healthSchema } from '@platform/contracts';
import type { DatabaseHealth, Health } from '@platform/contracts';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import { HealthService } from './health.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up. Does not touch the database. */
  @Get()
  @SkipThrottle()
  @ResponseMessage('API is running')
  @ApiEnvelopeResponse(healthSchema, { description: 'The API process is running.' })
  check(): Health {
    return { status: 'ok' };
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
