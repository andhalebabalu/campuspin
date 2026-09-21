export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** User-supplied text (a display name) must never be able to inject markup into an email. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** `86400` -> "24 hours", `3600` -> "1 hour", `1800` -> "30 minutes". */
export function describeDuration(seconds: number): string {
  const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;
  if (seconds % 86_400 === 0) return plural(seconds / 86_400, 'day');
  if (seconds % 3600 === 0) return plural(seconds / 3600, 'hour');
  return plural(Math.max(1, Math.round(seconds / 60)), 'minute');
}

interface ActionEmail {
  appName: string;
  name: string;
  subject: string;
  intro: string;
  buttonLabel: string;
  url: string;
  expiresInSeconds: number;
  ignoreNotice: string;
}

function renderActionEmail(input: ActionEmail): RenderedEmail {
  const expires = describeDuration(input.expiresInSeconds);
  const text =
    `Hi ${input.name},\n\n${input.intro}\n\n${input.url}\n\n` +
    `This link works once and expires in ${expires}.\n\n${input.ignoreNotice}\n\n- The ${input.appName} team`;

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1f2937">` +
    `<p>Hi ${escapeHtml(input.name)},</p>` +
    `<p>${escapeHtml(input.intro)}</p>` +
    `<p><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 20px;` +
    `background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px">` +
    `${escapeHtml(input.buttonLabel)}</a></p>` +
    `<p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br>` +
    `${escapeHtml(input.url)}</p>` +
    `<p style="font-size:13px;color:#6b7280">This link works once and expires in ${expires}. ` +
    `${escapeHtml(input.ignoreNotice)}</p>` +
    `<p style="font-size:13px;color:#6b7280">- The ${escapeHtml(input.appName)} team</p></div>`;

  return { subject: input.subject, text, html };
}

export function renderVerificationEmail(input: {
  appName: string;
  name: string;
  url: string;
  expiresInSeconds: number;
}): RenderedEmail {
  return renderActionEmail({
    ...input,
    subject: `Verify your email for ${input.appName}`,
    intro: `Welcome to ${input.appName}! Please confirm your email address to activate your account.`,
    buttonLabel: 'Verify my email',
    ignoreNotice: 'If you did not create an account, you can ignore this email.',
  });
}

export function renderPasswordResetEmail(input: {
  appName: string;
  name: string;
  url: string;
  expiresInSeconds: number;
}): RenderedEmail {
  return renderActionEmail({
    ...input,
    subject: `Reset your ${input.appName} password`,
    intro: 'We received a request to reset your password. Choose a new one using the link below.',
    buttonLabel: 'Reset my password',
    ignoreNotice:
      'If you did not ask for this, you can ignore this email; your password stays the same.',
  });
}
