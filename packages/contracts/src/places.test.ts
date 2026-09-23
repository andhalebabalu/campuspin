import { describe, expect, it } from 'vitest';
import {
  addPlaceImageRequestSchema,
  createPlaceRequestSchema,
  listPlacesQuerySchema,
  placeActionRequestSchema,
  placeHourInputSchema,
  placeIdOrSlugSchema,
  placePriceOptionInputSchema,
  placeSlugSchema,
  updatePlaceImageRequestSchema,
  updatePlaceRequestSchema,
} from './index.js';

const CATEGORY_ID = '01a0babd-b2d2-725f-9c0f-ddbc81685942';
const CATEGORY_ID_2 = '01a0babd-b2d2-725f-9c0f-ddbc81685943';

const validPlace = {
  name: 'Sample Mess',
  address: 'Station Road, Ahilyanagar',
  city: 'Ahilyanagar',
  state: 'Maharashtra',
  latitude: 19.098,
  longitude: 74.75,
  categoryIds: [CATEGORY_ID],
};

describe('placeSlugSchema and placeIdOrSlugSchema', () => {
  it('accepts a normal slug, lower-cased', () => {
    expect(placeSlugSchema.parse('Sample-Mess')).toBe('sample-mess');
  });

  it('rejects an id-shaped slug', () => {
    expect(placeSlugSchema.safeParse(CATEGORY_ID).success).toBe(false);
  });

  it('rejects a reserved word', () => {
    expect(placeSlugSchema.safeParse('nearby').success).toBe(false);
  });

  it('accepts anything reasonable as an idOrSlug path value', () => {
    expect(placeIdOrSlugSchema.safeParse('sample-mess').success).toBe(true);
    expect(placeIdOrSlugSchema.safeParse(CATEGORY_ID).success).toBe(true);
  });
});

describe('listPlacesQuerySchema', () => {
  it('defaults sort to name and needs no coordinates', () => {
    const parsed = listPlacesQuerySchema.parse({});
    expect(parsed.sort).toBe('name');
  });

  it('needs lat and lng together', () => {
    expect(listPlacesQuerySchema.safeParse({ lat: 19.1 }).success).toBe(false);
    expect(listPlacesQuerySchema.safeParse({ lng: 74.7 }).success).toBe(false);
    expect(listPlacesQuerySchema.safeParse({ lat: 19.1, lng: 74.7 }).success).toBe(true);
  });

  it('rejects sort=nearest without coordinates or a collegeSlug', () => {
    expect(listPlacesQuerySchema.safeParse({ sort: 'nearest' }).success).toBe(false);
    expect(listPlacesQuerySchema.safeParse({ sort: 'nearest', lat: 19.1, lng: 74.7 }).success).toBe(
      true,
    );
  });

  it('accepts sort=nearest with only a collegeSlug (distance defaults to "from that college")', () => {
    expect(
      listPlacesQuerySchema.safeParse({ sort: 'nearest', collegeSlug: 'sample-college' }).success,
    ).toBe(true);
  });

  it('rejects null island', () => {
    expect(listPlacesQuerySchema.safeParse({ lat: 0, lng: 0 }).success).toBe(false);
  });

  it('accepts collegeSlug and categorySlug filters', () => {
    const parsed = listPlacesQuerySchema.parse({
      collegeSlug: 'sample-arts-science-college',
      categorySlug: 'mess',
    });
    expect(parsed.collegeSlug).toBe('sample-arts-science-college');
    expect(parsed.categorySlug).toBe('mess');
  });
});

describe('createPlaceRequestSchema', () => {
  it('accepts the minimum required fields and fills in the defaults', () => {
    const parsed = createPlaceRequestSchema.parse(validPlace);
    expect(parsed).toMatchObject({
      country: 'India',
      status: 'DRAFT',
      amenityIds: [],
      hours: [],
      priceOptions: [],
    });
  });

  it('rejects an unknown field', () => {
    expect(createPlaceRequestSchema.safeParse({ ...validPlace, ratingAverage: 4.5 }).success).toBe(
      false,
    );
  });

  it('rejects null island', () => {
    expect(
      createPlaceRequestSchema.safeParse({ ...validPlace, latitude: 0, longitude: 0 }).success,
    ).toBe(false);
  });

  it('needs at least one category, and at most the maximum', () => {
    expect(createPlaceRequestSchema.safeParse({ ...validPlace, categoryIds: [] }).success).toBe(
      false,
    );
    const tooMany = Array.from({ length: 6 }, (_, i) => `01a0babd-b2d2-725f-9c0f-ddbc8168594${i}`);
    expect(
      createPlaceRequestSchema.safeParse({ ...validPlace, categoryIds: tooMany }).success,
    ).toBe(false);
  });

  it('rejects the same category twice', () => {
    expect(
      createPlaceRequestSchema.safeParse({
        ...validPlace,
        categoryIds: [CATEGORY_ID, CATEGORY_ID],
      }).success,
    ).toBe(false);
  });

  it('accepts a full place with amenities, hours and price options', () => {
    const full = {
      ...validPlace,
      description: 'A sample mess.',
      country: 'India',
      phone: '+91 98765 43210',
      email: 'contact@sample-mess.example.com',
      website: 'https://sample-mess.example.com',
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=19.098,74.75',
      status: 'ACTIVE',
      categoryIds: [CATEGORY_ID, CATEGORY_ID_2],
      amenityIds: [CATEGORY_ID],
      hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '21:00' }],
      priceOptions: [{ label: 'Monthly, veg', amount: 3000, unit: 'MONTH' }],
    };
    expect(createPlaceRequestSchema.safeParse(full).success).toBe(true);
  });

  it('rejects an invalid phone number', () => {
    expect(createPlaceRequestSchema.safeParse({ ...validPlace, phone: 'call me' }).success).toBe(
      false,
    );
  });
});

describe('updatePlaceRequestSchema', () => {
  it('rejects an empty body', () => {
    expect(updatePlaceRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a single field', () => {
    expect(updatePlaceRequestSchema.safeParse({ name: 'New Name' }).success).toBe(true);
  });

  it('allows clearing optional text with null', () => {
    expect(updatePlaceRequestSchema.safeParse({ description: null }).success).toBe(true);
  });

  it('refuses status and verification, which have their own endpoints', () => {
    expect(updatePlaceRequestSchema.safeParse({ status: 'ACTIVE' }).success).toBe(false);
    expect(updatePlaceRequestSchema.safeParse({ verificationStatus: 'VERIFIED' }).success).toBe(
      false,
    );
  });

  it('replaces categoryIds wholesale when sent', () => {
    const parsed = updatePlaceRequestSchema.parse({ categoryIds: [CATEGORY_ID] });
    expect(parsed.categoryIds).toEqual([CATEGORY_ID]);
  });
});

describe('placeHourInputSchema', () => {
  it('accepts an open/close slot', () => {
    expect(
      placeHourInputSchema.safeParse({ dayOfWeek: 1, openTime: '09:00', closeTime: '21:00' })
        .success,
    ).toBe(true);
  });

  it('accepts a closed day with no times', () => {
    expect(placeHourInputSchema.safeParse({ dayOfWeek: 7, isClosed: true }).success).toBe(true);
  });

  it('accepts a 24-hour day with no times', () => {
    expect(placeHourInputSchema.safeParse({ dayOfWeek: 3, is24Hours: true }).success).toBe(true);
  });

  it('rejects a slot with only one of openTime/closeTime', () => {
    expect(placeHourInputSchema.safeParse({ dayOfWeek: 1, openTime: '09:00' }).success).toBe(false);
  });

  it('rejects an open slot that is also marked closed', () => {
    expect(
      placeHourInputSchema.safeParse({
        dayOfWeek: 1,
        isClosed: true,
        openTime: '09:00',
        closeTime: '21:00',
      }).success,
    ).toBe(false);
  });

  it('rejects being both closed and 24 hours', () => {
    expect(
      placeHourInputSchema.safeParse({ dayOfWeek: 1, isClosed: true, is24Hours: true }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range weekday', () => {
    expect(placeHourInputSchema.safeParse({ dayOfWeek: 8, is24Hours: true }).success).toBe(false);
  });
});

describe('createPlaceRequestSchema: duplicate hour slots', () => {
  it('rejects two rows for the same day and position', () => {
    expect(
      createPlaceRequestSchema.safeParse({
        ...validPlace,
        hours: [
          { dayOfWeek: 1, is24Hours: true },
          { dayOfWeek: 1, isClosed: true },
        ],
      }).success,
    ).toBe(false);
  });

  it('allows two slots on the same day at different positions', () => {
    expect(
      createPlaceRequestSchema.safeParse({
        ...validPlace,
        hours: [
          { dayOfWeek: 1, openTime: '08:00', closeTime: '10:00', sortOrder: 0 },
          { dayOfWeek: 1, openTime: '19:00', closeTime: '21:00', sortOrder: 1 },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('placePriceOptionInputSchema', () => {
  it('accepts a normal price', () => {
    expect(
      placePriceOptionInputSchema.safeParse({ label: 'Monthly', amount: 3000, unit: 'MONTH' })
        .success,
    ).toBe(true);
  });

  it('rejects a negative amount', () => {
    expect(
      placePriceOptionInputSchema.safeParse({ label: 'Monthly', amount: -1, unit: 'MONTH' })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown unit', () => {
    expect(
      placePriceOptionInputSchema.safeParse({ label: 'Monthly', amount: 3000, unit: 'FORTNIGHT' })
        .success,
    ).toBe(false);
  });
});

describe('placeActionRequestSchema', () => {
  it('is optional, and accepts an optional reason', () => {
    expect(placeActionRequestSchema.safeParse(undefined).success).toBe(true);
    expect(placeActionRequestSchema.safeParse({ reason: 'Permanently closed' }).success).toBe(true);
  });
});

describe('place image request schemas', () => {
  it('add: needs an http(s) imageUrl', () => {
    expect(
      addPlaceImageRequestSchema.safeParse({ imageUrl: 'https://cdn.example.com/a.jpg' }).success,
    ).toBe(true);
    expect(addPlaceImageRequestSchema.safeParse({ imageUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    );
  });

  it('update: rejects an empty body', () => {
    expect(updatePlaceImageRequestSchema.safeParse({}).success).toBe(false);
  });

  it('update: accepts isCover alone', () => {
    expect(updatePlaceImageRequestSchema.safeParse({ isCover: true }).success).toBe(true);
  });
});
