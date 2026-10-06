import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { type EmailMessage, EmailProvider } from './email-provider.js';

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** A credential. Never logged. */
  pass: string;
}

/**
 * Sends for real through an SMTP server (Gmail with an app password, SES, Brevo, ...). One pooled
 * connection is reused across emails. Without implicit TLS (port 587) STARTTLS is required, so the
 * password never crosses the wire in clear text.
 */
export class SmtpEmailProvider extends EmailProvider {
  private readonly logger = new Logger('SmtpEmail');
  private readonly transporter: Transporter;

  constructor(settings: SmtpSettings) {
    super();
    this.transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: !settings.secure,
      auth: { user: settings.user, pass: settings.pass },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    // A wrong password or blocked port shows up at startup, not on the first sign-up. Not fatal:
    // the server may just be briefly unreachable.
    this.transporter.verify().then(
      () => this.logger.log(`SMTP ready: ${settings.user} via ${settings.host}:${settings.port}`),
      (error: unknown) =>
        this.logger.error(
          `SMTP check failed for ${settings.host}:${settings.port}: ${error instanceof Error ? error.message : String(error)}`,
        ),
    );
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
