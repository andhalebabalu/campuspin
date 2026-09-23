import { describe, expect, it } from 'vitest';
import {
  createSubmissionRequestSchema,
  duplicateCheckRequestSchema,
  markDuplicateRequestSchema,
  rejectSubmissionRequestSchema,
} from './index.js';

const CATEGORY_ID = '01a0babd-b2d2-725f-9c0f-ddbc81685942';
const PLACE_ID = '01a0babd-b2d2-725f-9c0f-ddbc81685943';

const validSubmission = {
  name: 'Sample Mess',
  categoryId: CATEGORY_ID,
  address: 'Station Road, Ahilyanagar',
  latitude: 19.098,
  longitude: 74.75,
};

describe('duplicateCheckRequestSchema', () => {
  it('accepts the minimum needed to score candidates', () => {
    expect(
      duplicateCheckRequestSchema.safeParse({
        name: 'Sample Mess',
        categoryId: CATEGORY_ID,
        latitude: 19.098,
        longitude: 74.75,
      }).success,
    ).toBe(true);
  });

  it('rejects null island', () => {
    expect(
      duplicateCheckRequestSchema.safeParse({
        name: 'Sample Mess',
        categoryId: CATEGORY_ID,
        latitude: 0,
        longitude: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(
      duplicateCheckRequestSchema.safeParse({
        ...validSubmission,
        extra: 'nope',
      }).success,
    ).toBe(false);
  });
});

describe('createSubmissionRequestSchema', () => {
  it('accepts the minimum fields, defaulting images and confirmDifferent', () => {
    const parsed = createSubmissionRequestSchema.parse(validSubmission);
    expect(parsed.images).toEqual([]);
    expect(parsed.confirmDifferent).toBe(false);
  });

  it('rejects null island', () => {
    expect(
      createSubmissionRequestSchema.safeParse({ ...validSubmission, latitude: 0, longitude: 0 })
        .success,
    ).toBe(false);
  });

  it('needs priceAmount and priceUnit together', () => {
    expect(
      createSubmissionRequestSchema.safeParse({ ...validSubmission, priceAmount: 3000 }).success,
    ).toBe(false);
    expect(
      createSubmissionRequestSchema.safeParse({ ...validSubmission, priceUnit: 'MONTH' }).success,
    ).toBe(false);
    expect(
      createSubmissionRequestSchema.safeParse({
        ...validSubmission,
        priceAmount: 3000,
        priceUnit: 'MONTH',
      }).success,
    ).toBe(true);
  });

  it('caps images at the maximum', () => {
    const images = Array.from({ length: 11 }, (_, index) => ({
      imageUrl: `https://cdn.example.com/${index}.jpg`,
    }));
    expect(createSubmissionRequestSchema.safeParse({ ...validSubmission, images }).success).toBe(
      false,
    );
  });

  it('rejects an unknown field', () => {
    expect(
      createSubmissionRequestSchema.safeParse({ ...validSubmission, status: 'APPROVED' }).success,
    ).toBe(false);
  });
});

describe('rejectSubmissionRequestSchema', () => {
  it('requires a reason', () => {
    expect(rejectSubmissionRequestSchema.safeParse({}).success).toBe(false);
    expect(rejectSubmissionRequestSchema.safeParse({ reason: 'Not found' }).success).toBe(true);
  });
});

describe('markDuplicateRequestSchema', () => {
  it('requires duplicateOfPlaceId', () => {
    expect(markDuplicateRequestSchema.safeParse({}).success).toBe(false);
    expect(
      markDuplicateRequestSchema.safeParse({ duplicateOfPlaceId: PLACE_ID }).success,
    ).toBe(true);
  });
});
