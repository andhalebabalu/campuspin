export interface EmailMessage {
  /** Sender, as configured by `EMAIL_FROM` (`Name <address>`). */
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * How an email leaves the system. The rest of the API only ever talks to `EmailService`; adding a
 * real provider (SMTP, SES, ...) later means implementing this one method and choosing it in
 * `EmailModule`, with no change to the auth code.
 */
export abstract class EmailProvider {
  abstract send(message: EmailMessage): Promise<void>;
}
