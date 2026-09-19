import { classifyDatabaseError } from './database-probe.js';

describe('classifyDatabaseError', () => {
  it('recognises a missing database (MySQL error 1049)', () => {
    expect(classifyDatabaseError({ code: 'ER_BAD_DB_ERROR', errno: 1049 })).toBe(
      'DATABASE_NOT_FOUND',
    );
    expect(classifyDatabaseError({ errno: 1049 })).toBe('DATABASE_NOT_FOUND');
  });

  it('recognises rejected credentials (MySQL error 1045)', () => {
    expect(classifyDatabaseError({ code: 'ER_ACCESS_DENIED_ERROR', errno: 1045 })).toBe(
      'ACCESS_DENIED',
    );
  });

  it('recognises a server that is not running or not reachable', () => {
    expect(classifyDatabaseError({ code: 'ECONNREFUSED' })).toBe('SERVER_UNREACHABLE');
    expect(classifyDatabaseError({ code: 'ENOTFOUND' })).toBe('SERVER_UNREACHABLE');
  });

  it('unwraps an AggregateError (localhost resolving to both ::1 and 127.0.0.1)', () => {
    const aggregate = Object.assign(new Error('all attempts failed'), {
      errors: [{ code: 'ECONNREFUSED' }, { code: 'ECONNREFUSED' }],
    });
    expect(classifyDatabaseError(aggregate)).toBe('SERVER_UNREACHABLE');
  });

  it('recognises connection timeouts', () => {
    expect(classifyDatabaseError({ code: 'ETIMEDOUT' })).toBe('TIMEOUT');
    expect(classifyDatabaseError({ errno: 45012 })).toBe('TIMEOUT');
  });

  it('falls back to UNKNOWN for anything else, including non-error values', () => {
    expect(classifyDatabaseError(new Error('something odd'))).toBe('UNKNOWN');
    expect(classifyDatabaseError(undefined)).toBe('UNKNOWN');
    expect(classifyDatabaseError('nope')).toBe('UNKNOWN');
  });
});
