import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { ConsoleEmailProvider } from './console-email.provider.js';
import { EmailProvider } from './email-provider.js';
import { EmailService } from './email.service.js';
import { MemoryEmailProvider } from './memory-email.provider.js';

/** Chooses the provider from `EMAIL_PROVIDER`. Add a real provider here when one exists. */
@Global()
@Module({
  providers: [
    {
      provide: EmailProvider,
      inject: [AppConfig],
      useFactory: (config: AppConfig): EmailProvider =>
        config.email.provider === 'memory' ? new MemoryEmailProvider() : new ConsoleEmailProvider(),
    },
    EmailService,
  ],
  exports: [EmailService, EmailProvider],
})
export class EmailModule {}
