import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { ConsoleEmailProvider } from './console-email.provider.js';
import { EmailProvider } from './email-provider.js';
import { EmailService } from './email.service.js';
import { MemoryEmailProvider } from './memory-email.provider.js';
import { SmtpEmailProvider } from './smtp-email.provider.js';

/** Chooses the provider from `EMAIL_PROVIDER`. */
@Global()
@Module({
  providers: [
    {
      provide: EmailProvider,
      inject: [AppConfig],
      useFactory: (config: AppConfig): EmailProvider => {
        if (config.email.provider === 'memory') return new MemoryEmailProvider();
        if (config.email.smtp) return new SmtpEmailProvider(config.email.smtp);
        return new ConsoleEmailProvider();
      },
    },
    EmailService,
  ],
  exports: [EmailService, EmailProvider],
})
export class EmailModule {}
