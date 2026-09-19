import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '../config/app-config.js';

/** Only accept a caller-supplied request id when it is a plain token (prevents log injection). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: (req, res) => {
            const supplied = req.headers['x-request-id'];
            const id =
              typeof supplied === 'string' && SAFE_REQUEST_ID.test(supplied)
                ? supplied
                : randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          // Never write credentials to logs.
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          // Health probes fire constantly; logging each one is noise.
          autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
          ...(config.isProduction
            ? {}
            : {
                transport: {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true, translateTime: 'SYS:HH:MM:ss' },
                },
              }),
        },
      }),
    }),
  ],
})
export class LoggingModule {}
