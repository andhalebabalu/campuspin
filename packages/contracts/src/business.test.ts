import { describe, expect, it } from 'vitest';
import {
  createLeadRequestSchema,
  listBusinessLeadsQuerySchema,
  updateBusinessProfileRequestSchema,
  updateLeadRequestSchema,
} from './business.js';

describe('createLeadRequestSchema', () => {
  const valid = { message: 'Is a double room free from July?', consent: true };

  it('accepts a message with consent, phone optional', () => {
    expect(createLeadRequestSchema.parse(valid)).toEqual(valid);
    expect(
      createLeadRequestSchema.parse({ ...valid, contactPhone: ' +91 98765 43210 ' }).contactPhone,
    ).toBe('+91 98765 43210');
  });

  it('refuses without explicit consent', () => {
    expect(createLeadRequestSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(createLeadRequestSchema.safeParse({ message: valid.message }).success).toBe(false);
  });

  it('refuses a too-short message, a bad phone and unknown fields', () => {
    expect(createLeadRequestSchema.safeParse({ ...valid, message: 'hi' }).success).toBe(false);
    expect(createLeadRequestSchema.safeParse({ ...valid, contactPhone: 'call me' }).success).toBe(
      false,
    );
    expect(createLeadRequestSchema.safeParse({ ...valid, status: 'CLOSED' }).success).toBe(false);
  });
});

describe('updateLeadRequestSchema', () => {
  it('accepts only a known status', () => {
    expect(updateLeadRequestSchema.parse({ status: 'CONTACTED' })).toEqual({ status: 'CONTACTED' });
    expect(updateLeadRequestSchema.safeParse({ status: 'DELETED' }).success).toBe(false);
  });
});

describe('listBusinessLeadsQuerySchema', () => {
  it('coerces paging and validates the filters', () => {
    expect(listBusinessLeadsQuerySchema.parse({ page: '2', status: 'NEW' })).toMatchObject({
      page: 2,
      limit: 20,
      status: 'NEW',
    });
    expect(listBusinessLeadsQuerySchema.safeParse({ placeId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('updateBusinessProfileRequestSchema', () => {
  it('accepts a partial update and null to clear an optional field', () => {
    expect(
      updateBusinessProfileRequestSchema.parse({ phone: null, businessName: ' Sai  Krupa ' }),
    ).toEqual({ phone: null, businessName: 'Sai Krupa' });
  });

  it('refuses an empty update, a javascript: logo and an empty name', () => {
    expect(updateBusinessProfileRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateBusinessProfileRequestSchema.safeParse({ logoUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(updateBusinessProfileRequestSchema.safeParse({ businessName: '  ' }).success).toBe(
      false,
    );
  });
});
