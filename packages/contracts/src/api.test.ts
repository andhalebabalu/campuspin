import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  apiErrorSchema,
  apiSuccessSchema,
  databaseHealthSchema,
  healthSchema,
  validationDetailsSchema,
} from './index.js';

describe('apiSuccessSchema', () => {
  const schema = apiSuccessSchema(healthSchema);

  it('accepts the documented health response', () => {
    const parsed = schema.parse({
      success: true,
      data: { status: 'ok' },
      message: 'API is running',
    });
    expect(parsed.data.status).toBe('ok');
  });

  it('accepts pagination meta and rejects invalid meta', () => {
    const body = { success: true, message: 'Success', data: { status: 'ok' } };
    expect(
      schema.safeParse({ ...body, meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...body, meta: { page: 0, limit: 20, total: 0, totalPages: 0 } }).success,
    ).toBe(false);
  });

  it('rejects a body flagged as a failure', () => {
    expect(schema.safeParse({ success: false, data: { status: 'ok' }, message: 'x' }).success).toBe(
      false,
    );
  });
});

describe('apiErrorSchema', () => {
  it('accepts the documented error shape', () => {
    const parsed = apiErrorSchema.parse({
      success: false,
      message: 'Something went wrong',
      error: { code: 'INTERNAL_ERROR', details: {} },
      requestId: 'abc-123',
    });
    expect(parsed.error.code).toBe('INTERNAL_ERROR');
  });

  it('rejects an unknown error code', () => {
    expect(
      apiErrorSchema.safeParse({
        success: false,
        message: 'x',
        error: { code: 'NOT_A_REAL_CODE' },
      }).success,
    ).toBe(false);
  });

  it('has unique error codes', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

describe('validationDetailsSchema', () => {
  it('describes per-field messages', () => {
    expect(
      validationDetailsSchema.parse({ fields: { email: ['Invalid email'], _root: ['Bad body'] } }),
    ).toEqual({ fields: { email: ['Invalid email'], _root: ['Bad body'] } });
  });
});

describe('databaseHealthSchema', () => {
  it('requires database name and server version', () => {
    expect(databaseHealthSchema.safeParse({ status: 'ok' }).success).toBe(false);
    expect(
      databaseHealthSchema.safeParse({
        status: 'ok',
        database: 'link_platform',
        serverVersion: '10.4.32-MariaDB',
      }).success,
    ).toBe(true);
  });
});
