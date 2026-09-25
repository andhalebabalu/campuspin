import {
  adminCollegeListItemSchema,
  adminCollegeSchema,
  collegeCardSchema,
  collegeDetailSchema,
} from '@platform/contracts';
import {
  type AdminRow,
  toAdminCollege,
  toAdminListItem,
  toCollegeCard,
  toCollegeDetail,
} from './college-mappers.js';

const row: AdminRow = {
  id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
  slug: 'sample-arts-science-college',
  name: 'Sample Arts & Science College',
  shortName: 'Sample ASC',
  city: 'Ahilyanagar',
  state: 'Maharashtra',
  logoUrl: 'https://cdn.example.edu/logo.png',
  coverImageUrl: null,
  verificationStatus: 'VERIFIED',
  description: 'A sample college.',
  address: 'Station Road',
  country: 'India',
  website: 'https://college.example.edu',
  latitude: 19.096,
  longitude: 74.748,
  serviceRadiusMeters: 5000,
  images: [
    { id: 'i1', imageUrl: 'https://cdn.example.edu/1.jpg', altText: null, sortOrder: 0 },
    { id: 'i2', imageUrl: 'https://cdn.example.edu/2.jpg', altText: 'Gate', sortOrder: 1 },
  ],
  status: 'ACTIVE',
  isDemo: true,
  createdById: '01a0c44b-14bb-724c-98a4-00a05625e026',
  createdAt: new Date('2026-09-21T10:00:00.000Z'),
  updatedAt: new Date('2026-09-21T11:30:00.000Z'),
};

/** A row as the database might return it in future: with a column this API never meant to expose. */
const rowWithExtras = {
  ...row,
  internalNote: 'do not show',
  passwordHash: '$argon2id$leak',
} as AdminRow;

describe('toCollegeCard', () => {
  it('maps the public fields, derives `verified`, and carries the count and distance', () => {
    expect(toCollegeCard(row, 14, 850)).toEqual({
      id: row.id,
      slug: row.slug,
      name: row.name,
      shortName: 'Sample ASC',
      city: 'Ahilyanagar',
      state: 'Maharashtra',
      logoUrl: 'https://cdn.example.edu/logo.png',
      coverImageUrl: null,
      verified: true,
      placeCount: 14,
      distanceMeters: 850,
      streams: ['arts-science-commerce'],
      management: null,
      courses: null,
    });
  });

  it.each([
    ['VERIFIED', true],
    ['PENDING', false],
    ['REJECTED', false],
  ] as const)('%s means verified: %s', (verificationStatus, verified) => {
    expect(toCollegeCard({ ...row, verificationStatus }, 0, null).verified).toBe(verified);
  });

  it('matches the public contract', () => {
    expect(collegeCardSchema.safeParse(toCollegeCard(row, 3, null)).success).toBe(true);
  });
});

describe('toCollegeDetail', () => {
  it('has exactly the fields of the public detail contract: no staff-only field can appear', () => {
    const detail = toCollegeDetail(row, 14);
    expect(Object.keys(detail).sort()).toEqual(Object.keys(collegeDetailSchema.shape).sort());
    for (const staffOnly of [
      'status',
      'verificationStatus',
      'isDemo',
      'createdById',
      'createdAt',
      'updatedAt',
    ]) {
      expect(detail).not.toHaveProperty(staffOnly);
    }
    expect(collegeDetailSchema.safeParse(detail).success).toBe(true);
  });

  it('keeps the gallery in the order it was given', () => {
    expect(toCollegeDetail(row, 0).images.map((image) => image.id)).toEqual(['i1', 'i2']);
  });

  it('does not copy unknown columns from the row into the response', () => {
    const json = JSON.stringify(toCollegeDetail(rowWithExtras, 0));
    expect(json).not.toMatch(/internalNote|passwordHash|argon2|do not show/);
  });
});

describe('toAdminCollege / toAdminListItem', () => {
  it('adds the staff fields, with dates as ISO strings', () => {
    const admin = toAdminCollege(row, 14);
    expect(admin).toMatchObject({
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      isDemo: true,
      createdById: row.createdById,
      createdAt: '2026-09-21T10:00:00.000Z',
      updatedAt: '2026-09-21T11:30:00.000Z',
    });
    expect(admin.images).toHaveLength(2);
    expect(adminCollegeSchema.safeParse(admin).success).toBe(true);
  });

  it('the list item is the same view without the gallery', () => {
    const item = toAdminListItem(row, 14);
    expect(item).not.toHaveProperty('images');
    expect(adminCollegeListItemSchema.safeParse(item).success).toBe(true);
    const withoutGallery = Object.fromEntries(
      Object.entries(toAdminCollege(row, 14)).filter(([key]) => key !== 'images'),
    );
    expect(item).toEqual(withoutGallery);
  });

  it('does not copy unknown columns into the admin response either', () => {
    expect(JSON.stringify(toAdminCollege(rowWithExtras, 0))).not.toMatch(/internalNote|argon2/);
    expect(JSON.stringify(toAdminListItem(rowWithExtras, 0))).not.toMatch(/internalNote|argon2/);
  });
});
