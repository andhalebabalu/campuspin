import { type EmailMessage, EmailProvider } from './email-provider.js';

export interface SentEmail extends EmailMessage {
  sentAt: Date;
}

/**
 * AUTOMATED TESTS ONLY. Keeps every email in an in-process outbox so a test can read the one-time
 * link the user would have received. `send` records synchronously (before any await), so a caller
 * that does not await it still finds the email in the outbox straight away.
 */
export class MemoryEmailProvider extends EmailProvider {
  readonly outbox: SentEmail[] = [];

  send(message: EmailMessage): Promise<void> {
    this.outbox.push({ ...message, sentAt: new Date() });
    return Promise.resolve();
  }

  /** The most recent email sent to an address, or undefined. */
  latestTo(address: string): SentEmail | undefined {
    return this.outbox.findLast((email) => email.to === address);
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
