import { isUniqueConstraintError } from './prisma-errors.js';

describe('isUniqueConstraintError', () => {
  it("recognises Prisma's P2002", () => {
    expect(isUniqueConstraintError(Object.assign(new Error('x'), { code: 'P2002' }))).toBe(true);
  });

  it.each([
    ['another Prisma code', Object.assign(new Error('x'), { code: 'P2025' })],
    ['a plain error', new Error('x')],
    ['a string', 'P2002'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 2002],
  ])('does not treat %s as a unique-constraint error', (_label, value) => {
    expect(isUniqueConstraintError(value)).toBe(false);
  });
});
