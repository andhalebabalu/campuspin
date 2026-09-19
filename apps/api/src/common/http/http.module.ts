import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { AppException } from './app-exception.js';
import { ResponseInterceptor } from './response.interceptor.js';
import { issuesToFieldErrors } from './zod-issues.js';

/**
 * Registers the cross-cutting HTTP behaviour once for the whole application:
 * consistent success envelope, consistent error envelope, and zod request validation.
 *
 * Routes opt in to validation by attaching a schema: `@Body({ schema })`, `@Query({ schema })`,
 * `@Param('id', { schema })`. Validation failures become `VALIDATION_ERROR` responses.
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory: (issues) => AppException.validation(issuesToFieldErrors(issues)),
      }),
    },
  ],
})
export class HttpModule {}
