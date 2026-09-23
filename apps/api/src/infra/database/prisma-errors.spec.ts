import { isForeignKeyRestrictError, isUniqueConstraintError } from './prisma-errors.js';

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

describe('isForeignKeyRestrictError', () => {
  it("recognises Prisma's P2003", () => {
    expect(isForeignKeyRestrictError(Object.assign(new Error('x'), { code: 'P2003' }))).toBe(true);
  });

  it.each([
    ['a unique-constraint error', Object.assign(new Error('x'), { code: 'P2002' }) as unknown],
    ['a plain error', new Error('x')],
    ['null', null],
    ['undefined', undefined],
  ])('does not treat %s as a foreign-key-restrict error', (_label, value) => {
    expect(isForeignKeyRestrictError(value)).toBe(false);
  });
});
