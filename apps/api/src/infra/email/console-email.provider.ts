import { Logger } from '@nestjs/common';
import { type EmailMessage, EmailProvider } from './email-provider.js';

/**
 * DEVELOPMENT ONLY. Does not send anything: it prints the email, including its one-time link, to the
 * API log so a developer can complete the flow by copying the link. Because the log then contains a
 * credential, `AppConfig.productionProblems()` refuses to boot production with this provider.
 */
export class ConsoleEmailProvider extends EmailProvider {
  private readonly logger = new Logger('DevEmail');

  constructor() {
    super();
    this.logger.warn(
      'EMAIL_PROVIDER=console: emails are printed to this log and NOT sent (development only).',
    );
  }

  send(message: EmailMessage): Promise<void> {
    this.logger.log(
      `\n---------------- DEV EMAIL (not sent) ----------------\n` +
        `From:    ${message.from}\n` +
        `To:      ${message.to}\n` +
        `Subject: ${message.subject}\n\n` +
        `${message.text}\n` +
        `------------------------------------------------------`,
    );
    return Promise.resolve();
  }
}
