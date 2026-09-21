import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { EmailProvider } from './email-provider.js';
import { renderPasswordResetEmail, renderVerificationEmail } from './email-templates.js';

interface ActionEmailInput {
  to: string;
  name: string;
  /** The raw one-time token. It is placed in the link only; it is never logged by this service. */
  token: string;
}

/**
 * The only thing the rest of the API knows about email. Builds the link the web app will serve
 * (`WEB_BASE_URL/verify-email?token=...`, `WEB_BASE_URL/reset-password?token=...`), renders the
 * message, and hands it to the configured `EmailProvider`.
 */
@Injectable()
export class EmailService {
  constructor(
    private readonly provider: EmailProvider,
    private readonly config: AppConfig,
  ) {}

  sendVerificationEmail(input: ActionEmailInput): Promise<void> {
    const rendered = renderVerificationEmail({
      appName: this.config.appName,
      name: input.name,
      url: this.link('verify-email', input.token),
      expiresInSeconds: this.config.auth.emailVerificationTtlSeconds,
    });
    return this.provider.send({ from: this.config.email.from, to: input.to, ...rendered });
  }

  sendPasswordResetEmail(input: ActionEmailInput): Promise<void> {
    const rendered = renderPasswordResetEmail({
      appName: this.config.appName,
      name: input.name,
      url: this.link('reset-password', input.token),
      expiresInSeconds: this.config.auth.passwordResetTtlSeconds,
    });
    return this.provider.send({ from: this.config.email.from, to: input.to, ...rendered });
  }

  private link(page: string, token: string): string {
    return `${this.config.webBaseUrl}/${page}?token=${encodeURIComponent(token)}`;
  }
}
