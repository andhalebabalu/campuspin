import { withTimeout } from './with-timeout.js';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1_000, 'too slow')).resolves.toBe('done');
  });

  it('propagates the original rejection when the promise fails in time', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1_000, 'too slow')).rejects.toThrow(
      'boom',
    );
  });

  it('rejects with the timeout message when the promise is too slow', async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => undefined);

    const result = withTimeout(never, 500, 'too slow');
    const assertion = expect(result).rejects.toThrow('too slow');
    await vi.advanceTimersByTimeAsync(501);

    await assertion;
  });

  it('does not leave a pending timer behind after success', async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve(1), 10_000, 'too slow');
    expect(vi.getTimerCount()).toBe(0);
  });
});
