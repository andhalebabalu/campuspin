import { describe, expect, it } from 'vitest';
import {
  RESERVED_COLLEGE_SLUGS,
  addCollegeImageRequestSchema,
  adminCollegeSchema,
  adminListCollegesQuerySchema,
  collegeActionRequestSchema,
  collegeCardSchema,
  collegeDetailSchema,
  createCollegeRequestSchema,
  listCollegesQuerySchema,
  looksLikeUuid,
  paginationQuerySchema,
  slugSchema,
  updateCollegeImageRequestSchema,
  updateCollegeRequestSchema,
} from './index.js';

const VALID_CREATE = {
  name: 'Sample Arts & Science College',
  address: 'Station Road, Ahilyanagar',
  city: 'Ahilyanagar',
  state: 'Maharashtra',
  latitude: 19.0952,
  longitude: 74.7496,
};

const messagesOf = (result: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[] }> };
}) => (result.error?.issues ?? []).map((issue) => issue.path.join('.'));

describe('paginationQuerySchema', () => {
  it('defaults to page 1 with 20 per page and coerces query strings', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it.each([
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { limit: '0' },
    { limit: '51' },
    { limit: 'abc' },
  ])('rejects %j instead of clamping it', (query) => {
    expect(paginationQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('listCollegesQuerySchema', () => {
  it('has safe defaults', () => {
    expect(listCollegesQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sort: 'name',
      stream: [],
      management: [],
    });
  });

  it('coerces and trims', () => {
    const query = listCollegesQuerySchema.parse({
      q: '  science ',
      city: ' Ahilyanagar',
      lat: '19.09',
      lng: '74.74',
      sort: 'nearest',
    });
    expect(query).toMatchObject({
      q: 'science',
      city: 'Ahilyanagar',
      lat: 19.09,
      lng: 74.74,
      sort: 'nearest',
    });
  });

  it('requires lat and lng together', () => {
    expect(messagesOf(listCollegesQuerySchema.safeParse({ lat: '19' }))).toEqual(['lng']);
    expect(messagesOf(listCollegesQuerySchema.safeParse({ lng: '74' }))).toEqual(['lat']);
    expect(listCollegesQuerySchema.safeParse({ lat: '19', lng: '74' }).success).toBe(true);
  });

  it('requires a point for sort=nearest', () => {
    expect(messagesOf(listCollegesQuerySchema.safeParse({ sort: 'nearest' }))).toEqual(['sort']);
  });

  it.each([
    { lat: '91', lng: '0.5' },
    { lat: '-91', lng: '0.5' },
    { lat: '0.5', lng: '181' },
    { lat: 'north', lng: '74' },
  ])('rejects the impossible point %j', (point) => {
    expect(listCollegesQuerySchema.safeParse(point).success).toBe(false);
  });

  it('rejects null island, which is what an empty lat= and lng= would coerce to', () => {
    expect(listCollegesQuerySchema.safeParse({ lat: '', lng: '' }).success).toBe(false);
    expect(listCollegesQuerySchema.safeParse({ lat: '0', lng: '0' }).success).toBe(false);
  });

  it('accepts only the whitelisted sorts', () => {
    for (const sort of ['name', 'popular', 'newest']) {
      expect(listCollegesQuerySchema.safeParse({ sort }).success).toBe(true);
    }
    expect(listCollegesQuerySchema.safeParse({ sort: 'random' }).success).toBe(false);
    expect(listCollegesQuerySchema.safeParse({ sort: 'name; DROP TABLE colleges' }).success).toBe(
      false,
    );
  });

  it('limits the search text length', () => {
    expect(listCollegesQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  });
});

describe('adminListCollegesQuerySchema', () => {
  it('filters by status and verification, newest first by default', () => {
    expect(adminListCollegesQuerySchema.parse({})).toMatchObject({ sort: 'newest' });
    expect(
      adminListCollegesQuerySchema.parse({ status: 'INACTIVE', verification: 'PENDING' }),
    ).toMatchObject({
      status: 'INACTIVE',
      verification: 'PENDING',
    });
    expect(adminListCollegesQuerySchema.safeParse({ status: 'DELETED' }).success).toBe(false);
  });
});

describe('createCollegeRequestSchema', () => {
  it('needs only the essentials and fills in safe defaults', () => {
    expect(createCollegeRequestSchema.parse(VALID_CREATE)).toEqual({
      ...VALID_CREATE,
      country: 'India',
      serviceRadiusMeters: 5000,
      status: 'DRAFT',
    });
  });

  it('collapses whitespace in single-line text and normalises line endings in the description', () => {
    const parsed = createCollegeRequestSchema.parse({
      ...VALID_CREATE,
      name: '  Sample   Arts \t College ',
      description: 'Line one\r\nLine two\tindented',
    });
    expect(parsed.name).toBe('Sample Arts College');
    expect(parsed.description).toBe('Line one\nLine two\tindented');
  });

  it.each(['name', 'address', 'city', 'state', 'shortName'] as const)(
    'refuses markup in %s',
    (field) => {
      const result = createCollegeRequestSchema.safeParse({
        ...VALID_CREATE,
        [field]: '<script>alert(1)</script>',
      });
      expect(messagesOf(result)).toContain(field);
    },
  );

  it('refuses markup, NUL and bidi overrides in text', () => {
    const nul = String.fromCharCode(0);
    const rlo = String.fromCodePoint(0x202e);
    for (const description of ['<b>bold</b>', `bad${nul}byte`, `spoof${rlo}text`]) {
      expect(createCollegeRequestSchema.safeParse({ ...VALID_CREATE, description }).success).toBe(
        false,
      );
    }
    // A newline is fine in a description but never in a single-line field.
    expect(
      createCollegeRequestSchema.safeParse({ ...VALID_CREATE, description: 'a\nb' }).success,
    ).toBe(true);
    expect(createCollegeRequestSchema.parse({ ...VALID_CREATE, name: 'Two\nLines' }).name).toBe(
      'Two Lines',
    );
  });

  it('accepts names in other scripts', () => {
    expect(
      createCollegeRequestSchema.safeParse({ ...VALID_CREATE, name: 'अहिल्यानगर महाविद्यालय' })
        .success,
    ).toBe(true);
  });

  it('bounds text lengths', () => {
    expect(
      createCollegeRequestSchema.safeParse({ ...VALID_CREATE, name: 'x'.repeat(201) }).success,
    ).toBe(false);
    expect(
      createCollegeRequestSchema.safeParse({ ...VALID_CREATE, description: 'x'.repeat(5001) })
        .success,
    ).toBe(false);
    expect(createCollegeRequestSchema.safeParse({ ...VALID_CREATE, name: '   ' }).success).toBe(
      false,
    );
  });

  describe('links', () => {
    it.each([
      ['https://college.example.edu', true],
      ['http://college.example.edu/about', true],
      ['javascript:alert(1)', false],
      ['data:text/html;base64,AAAA', false],
      ['ftp://files.example.edu', false],
      ['//college.example.edu', false],
      ['college.example.edu', false],
      ['https://user:secret@college.example.edu', false],
      ['https://user@college.example.edu', false],
      // An @ after the host is ordinary path or query text, not credentials.
      ['https://college.example.edu/team/@head', true],
      ['https://college.example.edu/?contact=a@b.example', true],
      [`https://college.example.edu/${'a'.repeat(500)}`, false],
    ])('website %s is accepted: %s', (website, accepted) => {
      expect(createCollegeRequestSchema.safeParse({ ...VALID_CREATE, website }).success).toBe(
        accepted,
      );
    });

    it('applies the same rule to the logo and cover image', () => {
      expect(
        createCollegeRequestSchema.safeParse({ ...VALID_CREATE, logoUrl: 'javascript:alert(1)' })
          .success,
      ).toBe(false);
      expect(
        createCollegeRequestSchema.safeParse({
          ...VALID_CREATE,
          coverImageUrl: 'https://cdn.example.edu/c.jpg',
        }).success,
      ).toBe(true);
    });
  });

  describe('coordinates and radius', () => {
    it.each([
      [{ latitude: 90, longitude: 180 }, true],
      [{ latitude: -90, longitude: -180 }, true],
      [{ latitude: 90.0001, longitude: 74 }, false],
      [{ latitude: 19, longitude: -180.5 }, false],
      [{ latitude: 0, longitude: 74.7 }, true],
      [{ latitude: 0, longitude: 0 }, false],
    ])('%j is accepted: %s', (point, accepted) => {
      expect(createCollegeRequestSchema.safeParse({ ...VALID_CREATE, ...point }).success).toBe(
        accepted,
      );
    });

    it('needs both coordinates and finite numbers', () => {
      const withoutLatitude = Object.fromEntries(
        Object.entries(VALID_CREATE).filter(([key]) => key !== 'latitude'),
      );
      expect(createCollegeRequestSchema.safeParse(withoutLatitude).success).toBe(false);
      expect(
        createCollegeRequestSchema.safeParse({ ...VALID_CREATE, latitude: '19.09' }).success,
      ).toBe(false);
      expect(
        createCollegeRequestSchema.safeParse({ ...VALID_CREATE, latitude: Number.NaN }).success,
      ).toBe(false);
    });

    it.each([
      [99, false],
      [100, true],
      [50_000, true],
      [50_001, false],
      [5000.5, false],
      [0, false],
      [-1, false],
    ])('service radius %d m is accepted: %s', (serviceRadiusMeters, accepted) => {
      expect(
        createCollegeRequestSchema.safeParse({ ...VALID_CREATE, serviceRadiusMeters }).success,
      ).toBe(accepted);
    });
  });

  describe('slug', () => {
    it('is optional, and a given one is lower-cased', () => {
      expect(createCollegeRequestSchema.parse({ ...VALID_CREATE, slug: 'My-College-2' }).slug).toBe(
        'my-college-2',
      );
    });

    it.each([
      'ab',
      'has space',
      'under_score',
      '-lead',
      'trail-',
      'double--hyphen',
      'unicode-é',
      'x'.repeat(121),
    ])('rejects the slug %j', (slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    });

    it('refuses reserved words and anything shaped like an id', () => {
      for (const reserved of RESERVED_COLLEGE_SLUGS) {
        expect(slugSchema.safeParse(reserved).success).toBe(false);
      }
      expect(slugSchema.safeParse('01a0babd-b2d2-725f-9c0f-ddbc81685942').success).toBe(false);
      expect(looksLikeUuid('01A0BABD-B2D2-725F-9C0F-DDBC81685942')).toBe(true);
      expect(looksLikeUuid('sample-college')).toBe(false);
    });
  });

  describe('mass assignment', () => {
    it.each([
      'isDemo',
      'verificationStatus',
      'createdById',
      'id',
      'createdAt',
      'placeCount',
      'images',
    ])('rejects an unknown or protected field: %s', (field) => {
      const result = createCollegeRequestSchema.safeParse({ ...VALID_CREATE, [field]: 'x' });
      expect(result.success).toBe(false);
    });

    it('lets a new college start as DRAFT or ACTIVE only', () => {
      expect(
        createCollegeRequestSchema.safeParse({ ...VALID_CREATE, status: 'ACTIVE' }).success,
      ).toBe(true);
      expect(
        createCollegeRequestSchema.safeParse({ ...VALID_CREATE, status: 'INACTIVE' }).success,
      ).toBe(false);
    });
  });
});

describe('updateCollegeRequestSchema', () => {
  it('changes only what is sent', () => {
    expect(updateCollegeRequestSchema.parse({ city: ' Pune ' })).toEqual({ city: 'Pune' });
  });

  it('rejects an empty body', () => {
    expect(updateCollegeRequestSchema.safeParse({}).success).toBe(false);
  });

  it('clears optional fields with null, but never required ones', () => {
    expect(
      updateCollegeRequestSchema.parse({
        shortName: null,
        description: null,
        website: null,
        logoUrl: null,
        coverImageUrl: null,
      }),
    ).toEqual({
      shortName: null,
      description: null,
      website: null,
      logoUrl: null,
      coverImageUrl: null,
    });
    for (const field of [
      'name',
      'address',
      'city',
      'state',
      'country',
      'latitude',
      'longitude',
      'serviceRadiusMeters',
    ]) {
      expect(updateCollegeRequestSchema.safeParse({ [field]: null }).success).toBe(false);
    }
  });

  it.each(['status', 'verificationStatus', 'isDemo', 'createdById', 'id'])(
    'refuses %s: it has its own endpoint or is not editable',
    (field) => {
      expect(updateCollegeRequestSchema.safeParse({ [field]: 'ACTIVE' }).success).toBe(false);
    },
  );

  it('applies the same text, link and coordinate rules', () => {
    expect(updateCollegeRequestSchema.safeParse({ name: '<b>x</b>' }).success).toBe(false);
    expect(updateCollegeRequestSchema.safeParse({ website: 'javascript:alert(1)' }).success).toBe(
      false,
    );
    expect(updateCollegeRequestSchema.safeParse({ latitude: 95 }).success).toBe(false);
    expect(updateCollegeRequestSchema.safeParse({ latitude: 0, longitude: 0 }).success).toBe(false);
    // One coordinate alone is fine; the service checks the merged pair.
    expect(updateCollegeRequestSchema.safeParse({ latitude: 0 }).success).toBe(true);
  });
});

describe('collegeActionRequestSchema', () => {
  it('accepts no body, an empty body, or a reason', () => {
    expect(collegeActionRequestSchema.safeParse(undefined).success).toBe(true);
    expect(collegeActionRequestSchema.safeParse({}).success).toBe(true);
    expect(collegeActionRequestSchema.parse({ reason: '  Duplicate  entry ' })).toEqual({
      reason: 'Duplicate entry',
    });
  });

  it('rejects unknown fields and over-long or markup reasons', () => {
    expect(collegeActionRequestSchema.safeParse({ status: 'ACTIVE' }).success).toBe(false);
    expect(collegeActionRequestSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
    expect(collegeActionRequestSchema.safeParse({ reason: '<script>' }).success).toBe(false);
  });
});

describe('image requests', () => {
  it('needs a safe URL and takes optional alt text and order', () => {
    expect(
      addCollegeImageRequestSchema.parse({ imageUrl: 'https://cdn.example.edu/a.jpg' }),
    ).toEqual({
      imageUrl: 'https://cdn.example.edu/a.jpg',
    });
    expect(
      addCollegeImageRequestSchema.parse({
        imageUrl: 'https://cdn.example.edu/a.jpg',
        altText: 'Gate',
        sortOrder: 2,
      }),
    ).toMatchObject({ altText: 'Gate', sortOrder: 2 });
    expect(
      addCollegeImageRequestSchema.safeParse({ imageUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(
      addCollegeImageRequestSchema.safeParse({
        imageUrl: 'https://cdn.example.edu/a.jpg',
        sortOrder: -1,
      }).success,
    ).toBe(false);
    expect(
      addCollegeImageRequestSchema.safeParse({
        imageUrl: 'https://cdn.example.edu/a.jpg',
        extra: 1,
      }).success,
    ).toBe(false);
  });

  it('cannot change the URL of an image, only its label and order', () => {
    expect(updateCollegeImageRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateCollegeImageRequestSchema.safeParse({ imageUrl: 'https://x.example/y.jpg' }).success,
    ).toBe(false);
    expect(updateCollegeImageRequestSchema.parse({ altText: null, sortOrder: 0 })).toEqual({
      altText: null,
      sortOrder: 0,
    });
  });
});

describe('response schemas', () => {
  const card = {
    id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
    slug: 'sample-arts-science-college',
    name: 'Sample Arts & Science College',
    shortName: 'Sample ASC',
    city: 'Ahilyanagar',
    state: 'Maharashtra',
    logoUrl: null,
    coverImageUrl: null,
    verified: true,
    placeCount: 14,
    distanceMeters: 850,
    streams: ['arts-science-commerce'],
    management: 'aided',
    courses: null,
  };

  it('describe a card, a detail and an admin view', () => {
    expect(collegeCardSchema.safeParse(card).success).toBe(true);
    expect(collegeCardSchema.safeParse({ ...card, distanceMeters: null }).success).toBe(true);
    const rest = Object.fromEntries(
      Object.entries(card).filter(
        ([key]) => !['distanceMeters', 'streams', 'management', 'courses'].includes(key),
      ),
    );
    const detail = {
      ...rest,
      description: null,
      address: 'Station Road',
      country: 'India',
      website: null,
      latitude: 19.09,
      longitude: 74.74,
      serviceRadiusMeters: 5000,
      images: [],
    };
    expect(collegeDetailSchema.safeParse(detail).success).toBe(true);
    expect(
      adminCollegeSchema.safeParse({
        ...detail,
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        isDemo: false,
        createdById: null,
        createdAt: '2026-09-21T00:00:00.000Z',
        updatedAt: '2026-09-21T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('a public detail has no room for admin-only fields', () => {
    expect(Object.keys(collegeDetailSchema.shape)).not.toEqual(
      expect.arrayContaining(['status', 'verificationStatus', 'isDemo', 'createdById']),
    );
  });
});

describe('documented examples', () => {
  interface Inspectable {
    meta: () => { example?: unknown } | undefined;
    def?: { innerType?: Inspectable };
  }
  /** The `example` of a field, looking through `.optional()` and `.default()` wrappers. */
  const example = (schema: unknown): unknown => {
    for (
      let current = schema as Inspectable | undefined;
      current;
      current = current.def?.innerType
    ) {
      const found = current.meta()?.example;
      if (found !== undefined) return found;
    }
    return undefined;
  };

  it('every field example is accepted by its own schema', () => {
    const shape = createCollegeRequestSchema.shape;
    const request = {
      name: example(shape.name),
      shortName: example(shape.shortName),
      address: example(shape.address),
      city: example(shape.city),
      state: example(shape.state),
      country: example(shape.country),
      latitude: example(shape.latitude),
      longitude: example(shape.longitude),
      serviceRadiusMeters: example(shape.serviceRadiusMeters),
      website: example(shape.website),
      logoUrl: example(shape.logoUrl),
      coverImageUrl: example(shape.coverImageUrl),
      slug: example(shape.slug),
    };
    expect(Object.values(request).every((value) => value !== undefined)).toBe(true);
    expect(createCollegeRequestSchema.safeParse(request).success).toBe(true);

    expect(
      listCollegesQuerySchema.safeParse({
        q: example(listCollegesQuerySchema.shape.q),
        city: example(listCollegesQuerySchema.shape.city),
        lat: example(listCollegesQuerySchema.shape.lat),
        lng: example(listCollegesQuerySchema.shape.lng),
        sort: 'nearest',
      }).success,
    ).toBe(true);
    expect(
      addCollegeImageRequestSchema.safeParse({
        imageUrl: example(addCollegeImageRequestSchema.shape.imageUrl),
        altText: example(addCollegeImageRequestSchema.shape.altText),
      }).success,
    ).toBe(true);
  });
});

describe('listCollegesQuerySchema stream and management filters', () => {
  it('splits comma-separated values and rejects unknown ones', () => {
    expect(
      listCollegesQuerySchema.parse({ stream: 'engineering,pharmacy', management: 'aided' }),
    ).toMatchObject({ stream: ['engineering', 'pharmacy'], management: ['aided'] });
    expect(listCollegesQuerySchema.safeParse({ stream: 'medicine' }).success).toBe(false);
    expect(listCollegesQuerySchema.safeParse({ management: 'private' }).success).toBe(false);
  });
});
