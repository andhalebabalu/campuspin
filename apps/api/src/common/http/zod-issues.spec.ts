import { z } from 'zod';
import { issuesToFieldErrors } from './zod-issues.js';

describe('issuesToFieldErrors', () => {
  it('groups messages by dotted field path', () => {
    const schema = z.object({
      email: z.email(),
      profile: z.object({ year: z.number().int().min(1) }),
      tags: z.array(z.string().min(2)),
    });
    const result = schema.safeParse({ email: 'nope', profile: { year: 0 }, tags: ['a'] });

    expect(result.success).toBe(false);
    const fields = issuesToFieldErrors(result.error?.issues ?? []);
    expect(Object.keys(fields).sort()).toEqual(['email', 'profile.year', 'tags.0']);
    expect(fields.email?.[0]).toMatch(/email/i);
  });

  it('files whole-body problems under _root', () => {
    const result = z.object({ a: z.string() }).strict().safeParse('not an object');
    expect(Object.keys(issuesToFieldErrors(result.error?.issues ?? []))).toEqual(['_root']);
  });

  it('collects several messages for one field', () => {
    const fields = issuesToFieldErrors([
      { message: 'Too short', path: ['password'] },
      { message: 'Needs a digit', path: ['password'] },
    ]);
    expect(fields).toEqual({ password: ['Too short', 'Needs a digit'] });
  });
});
