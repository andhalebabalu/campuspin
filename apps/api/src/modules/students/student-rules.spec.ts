import { hashToken } from '../../common/security/token-hash.js';
import {
  addDays,
  codeMatches,
  domainAllowed,
  emailDomain,
  generateCode,
  maskEmail,
  studentBadge,
} from './student-rules.js';

describe('emailDomain / domainAllowed', () => {
  it('takes the part after the last @, lowercase', () => {
    expect(emailDomain('Asha@ABC.edu.in')).toBe('abc.edu.in');
  });

  it.each([
    ['asha@abc.edu.in', true],
    ['asha@students.abc.edu.in', true],
    ['asha@notabc.edu.in', false],
    ['asha@abc.edu.in.evil.com', false],
    ['asha@gmail.com', false],
  ])('%s -> %s', (email, allowed) => {
    expect(domainAllowed(email, ['abc.edu.in'])).toBe(allowed);
  });

  it('allows nothing when the college has no domains', () => {
    expect(domainAllowed('asha@abc.edu.in', [])).toBe(false);
  });
});

describe('maskEmail', () => {
  it('keeps two letters and the domain', () => {
    expect(maskEmail('asha.kulkarni@abc.edu.in')).toBe('as***@abc.edu.in');
    expect(maskEmail('a@abc.edu.in')).toBe('a***@abc.edu.in');
  });
});

describe('generateCode / codeMatches', () => {
  it('makes 6-digit codes, zero-padded', () => {
    for (let i = 0; i < 50; i += 1) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it('matches only the right code against its hash', () => {
    const hash = hashToken('004817');
    expect(codeMatches('004817', hash)).toBe(true);
    expect(codeMatches('004818', hash)).toBe(false);
    expect(codeMatches('4817', hash)).toBe(false);
  });
});

describe('studentBadge', () => {
  const college = { id: 'c1', slug: 'abc', name: 'ABC College' };
  const now = new Date('2026-09-25T00:00:00.000Z');

  it('is verified while the verification is current', () => {
    const until = addDays(now, 10);
    expect(studentBadge({ verifiedCollege: college, studentVerifiedUntil: until }, now)).toEqual({
      verified: true,
      college,
      verifiedUntil: until.toISOString(),
    });
  });

  it('shows nothing once it lapses, and nothing without a verified college', () => {
    const lapsed = { verifiedCollege: college, studentVerifiedUntil: addDays(now, -1) };
    expect(studentBadge(lapsed, now)).toEqual({
      verified: false,
      college: null,
      verifiedUntil: null,
    });
    expect(studentBadge({ verifiedCollege: null, studentVerifiedUntil: null }, now).verified).toBe(
      false,
    );
  });

  it('never counts a missing relation as verified', () => {
    const missing = { studentVerifiedUntil: null } as unknown as Parameters<typeof studentBadge>[0];
    expect(studentBadge(missing, now).verified).toBe(false);
  });
});
