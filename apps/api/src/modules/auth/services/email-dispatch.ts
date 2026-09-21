import type { Logger } from '@nestjs/common';

/**
 * Sends an email WITHOUT making the request wait for it, and logs (never throws) a failure.
 *
 * Two reasons: the response time of "forgot password" and "resend verification" must not depend on
 * whether the address belongs to an account (real mail delivery is slow, so awaiting it would leak
 * that), and a mail outage must not fail registration (the user can simply request a new link).
 * The message may contain a one-time link, so only the failure reason is logged, never the message.
 *
 * `send` is invoked synchronously, so a provider that records before its first await (the in-memory
 * test provider) has already done so when this returns. Both a rejected promise and a synchronous
 * throw (for example a template bug) are contained.
 */
export function dispatchEmail(
  logger: Logger,
  description: string,
  send: () => Promise<void>,
): void {
  const report = (error: unknown): void => {
    logger.error(
      `Could not send ${description}: ${error instanceof Error ? error.message : String(error)}`,
    );
  };
  try {
    void send().catch(report);
  } catch (error) {
    report(error);
  }
}
