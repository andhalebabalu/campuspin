import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import { dispatchEmail } from './email-dispatch.js';

const logger = new Logger('test');

describe('dispatchEmail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts sending immediately, without waiting for it to finish', () => {
    let started = false;
    let finished = false;
    dispatchEmail(logger, 'test email', async () => {
      started = true;
      await new Promise((resolve) => setTimeout(resolve, 20));
      finished = true;
    });

    expect(started).toBe(true);
    expect(finished).toBe(false);
  });

  it('logs the reason, and only the reason, when sending is rejected', async () => {
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    dispatchEmail(logger, 'verification email', () =>
      Promise.reject(new Error('mailbox unavailable')),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith('Could not send verification email: mailbox unavailable');
  });

  it('contains a synchronous throw as well (for example a template bug)', () => {
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    expect(() =>
      dispatchEmail(logger, 'reset email', () => {
        throw new Error('template exploded');
      }),
    ).not.toThrow();

    expect(errorLog).toHaveBeenCalledWith('Could not send reset email: template exploded');
  });

  it('describes a non-Error rejection', async () => {
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    // Deliberately not an Error: some libraries reject with plain values, and that branch must work.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    dispatchEmail(logger, 'email', () => Promise.reject('plain string'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(errorLog).toHaveBeenCalledWith('Could not send email: plain string');
  });

  it('logs nothing on success', async () => {
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    dispatchEmail(logger, 'email', () => Promise.resolve());
    await new Promise((resolve) => setImmediate(resolve));

    expect(errorLog).not.toHaveBeenCalled();
  });
});
