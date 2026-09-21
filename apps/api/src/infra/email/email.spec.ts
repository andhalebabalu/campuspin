import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import { AppConfig } from '../config/app-config.js';
import { ConsoleEmailProvider } from './console-email.provider.js';
import { describeDuration, escapeHtml, renderVerificationEmail } from './email-templates.js';
import { EmailService } from './email.service.js';
import { MemoryEmailProvider } from './memory-email.provider.js';

const config = AppConfig.fromEnv({
  DATABASE_URL: 'mysql://root:@localhost:3306/x',
  WEB_BASE_URL: 'https://app.example.test',
  APP_NAME: 'Campus',
  EMAIL_FROM: 'Campus <no-reply@campus.test>',
  EMAIL_VERIFICATION_EXPIRES_IN: '24h',
  PASSWORD_RESET_EXPIRES_IN: '30m',
});

function setup() {
  const provider = new MemoryEmailProvider();
  return { provider, service: new EmailService(provider, config) };
}

describe('EmailService', () => {
  it('sends a verification email from EMAIL_FROM with a link to the web app', async () => {
    const { provider, service } = setup();

    await service.sendVerificationEmail({ to: 'asha@example.test', name: 'Asha', token: 'tok123' });

    const [email] = provider.outbox;
    expect(email).toMatchObject({
      from: 'Campus <no-reply@campus.test>',
      to: 'asha@example.test',
      subject: 'Verify your email for Campus',
    });
    expect(email?.text).toContain('https://app.example.test/verify-email?token=tok123');
    expect(email?.text).toContain('expires in 1 day');
    expect(email?.html).toContain('href="https://app.example.test/verify-email?token=tok123"');
  });

  it('sends a password reset email with the reset link and its shorter lifetime', async () => {
    const { provider, service } = setup();

    await service.sendPasswordResetEmail({
      to: 'asha@example.test',
      name: 'Asha',
      token: 'tok456',
    });

    const [email] = provider.outbox;
    expect(email?.subject).toBe('Reset your Campus password');
    expect(email?.text).toContain('https://app.example.test/reset-password?token=tok456');
    expect(email?.text).toContain('expires in 30 minutes');
  });

  it('URL-encodes the token so it survives inside a link', async () => {
    const { provider, service } = setup();

    await service.sendVerificationEmail({ to: 'a@b.test', name: 'A', token: 'a+b/c=d&e' });

    expect(provider.outbox[0]?.text).toContain('token=a%2Bb%2Fc%3Dd%26e');
  });

  it('cannot be tricked into markup by a hostile display name', async () => {
    const { provider, service } = setup();

    await service.sendVerificationEmail({
      to: 'a@b.test',
      name: '<img src=x onerror=alert(1)>',
      token: 't',
    });

    const [email] = provider.outbox;
    expect(email?.html).not.toContain('<img');
    expect(email?.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('email templates', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });

  it.each([
    [86_400, '1 day'],
    [172_800, '2 days'],
    [3600, '1 hour'],
    [7200, '2 hours'],
    [1800, '30 minutes'],
    [60, '1 minute'],
    [30, '1 minute'],
  ])('describes %i seconds as "%s"', (seconds, text) => {
    expect(describeDuration(seconds)).toBe(text);
  });

  it('renders a plain-text body that works without HTML', () => {
    const { text, subject } = renderVerificationEmail({
      appName: 'Campus',
      name: 'Asha',
      url: 'https://x.test/verify-email?token=t',
      expiresInSeconds: 3600,
    });
    expect(subject).toContain('Campus');
    expect(text).toMatch(/^Hi Asha,/);
    expect(text).toContain('https://x.test/verify-email?token=t');
    expect(text).not.toMatch(/<[a-z]/);
  });
});

describe('MemoryEmailProvider (tests only)', () => {
  const message = (to: string, subject: string) => ({
    from: 'f',
    to,
    subject,
    text: 't',
    html: 'h',
  });

  it('records synchronously, so a caller that does not await still finds the email', () => {
    const provider = new MemoryEmailProvider();
    void provider.send(message('a@x.test', 'one'));
    expect(provider.outbox).toHaveLength(1);
  });

  it('finds the latest email to an address, and can be cleared', async () => {
    const provider = new MemoryEmailProvider();
    await provider.send(message('a@x.test', 'first'));
    await provider.send(message('b@x.test', 'other'));
    await provider.send(message('a@x.test', 'second'));

    expect(provider.latestTo('a@x.test')?.subject).toBe('second');
    expect(provider.latestTo('nobody@x.test')).toBeUndefined();
    provider.clear();
    expect(provider.outbox).toHaveLength(0);
  });
});

describe('ConsoleEmailProvider (development only)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns at startup that it is development-only and sends nothing', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    new ConsoleEmailProvider();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/NOT sent.*development only/));
  });

  it('prints the message, including its one-time link, so a developer can complete the flow', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await new ConsoleEmailProvider().send({
      from: 'LINK <no-reply@localhost.test>',
      to: 'asha@example.test',
      subject: 'Verify your email for LINK',
      text: 'Open http://localhost:3000/verify-email?token=abc',
      html: '<p>ignored</p>',
    });

    const printed = String(log.mock.calls[0]?.[0]);
    expect(printed).toContain('To:      asha@example.test');
    expect(printed).toContain('Subject: Verify your email for LINK');
    expect(printed).toContain('http://localhost:3000/verify-email?token=abc');
    expect(printed).not.toContain('<p>');
  });
});
