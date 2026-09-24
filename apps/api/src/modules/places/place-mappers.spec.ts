import {
  adminPlaceListItemSchema,
  adminPlaceSchema,
  placeCardSchema,
  placeDetailSchema,
} from '@platform/contracts';
import type { AdminRow, DetailRow } from './place-mappers.js';
import { toAdminListItem, toAdminPlace, toPlaceCard, toPlaceDetail } from './place-mappers.js';

const category = {
  isPrimary: true,
  category: { id: 'cat-1', slug: 'mess', name: 'Mess', icon: 'utensils' },
};
const secondCategory = {
  isPrimary: false,
  category: { id: 'cat-2', slug: 'restaurant', name: 'Restaurant', icon: null },
};
const amenity = { amenity: { id: 'am-1', key: 'wifi', name: 'WiFi', icon: 'wifi' } };
const hour = {
  id: 'hour-1',
  dayOfWeek: 1,
  openTime: '09:00',
  closeTime: '21:00',
  isClosed: false,
  is24Hours: false,
  slotLabel: null,
  sortOrder: 0,
};
const priceOption = {
  id: 'price-1',
  label: 'Monthly, veg',
  amount: 3000,
  unit: 'MONTH' as const,
  note: null,
  sortOrder: 0,
};
const coverImage = {
  id: 'img-1',
  imageUrl: 'https://cdn.example.com/cover.jpg',
  altText: 'Cover',
  isCover: true,
  sortOrder: 0,
};
const otherImage = {
  id: 'img-2',
  imageUrl: 'https://cdn.example.com/other.jpg',
  altText: null,
  isCover: false,
  sortOrder: 1,
};

const detailRow: DetailRow = {
  id: '01a0c600-1111-7000-8000-000000000001',
  slug: 'sample-mess',
  name: 'Sample Mess',
  city: 'Ahilyanagar',
  state: 'Maharashtra',
  verificationStatus: 'VERIFIED',
  ratingAverage: 4.2,
  ratingCount: 18,
  businessProfileId: null,
  priceMin: 3000,
  priceMax: 3500,
  priceUnit: 'MONTH',
  categories: [category, secondCategory],
  images: [coverImage, otherImage],
  description: 'A sample mess.',
  address: 'Station Road, Ahilyanagar',
  country: 'India',
  phone: '+91 98765 43210',
  email: 'contact@sample-mess.example.com',
  website: 'https://sample-mess.example.com',
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=19.098,74.75',
  latitude: 19.098,
  longitude: 74.75,
  amenities: [amenity],
  hours: [hour],
  priceOptions: [priceOption],
};

const adminRow: AdminRow = {
  ...detailRow,
  status: 'ACTIVE',
  lastVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
  isDemo: false,
  createdById: 'user-1',
  publishedAt: new Date('2026-08-01T00:00:00.000Z'),
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

describe('toPlaceCard', () => {
  it('matches the public card schema', () => {
    const card = toPlaceCard(detailRow, 850);
    expect(placeCardSchema.safeParse(card).success).toBe(true);
  });

  it('picks the primary category and the cover image', () => {
    const card = toPlaceCard(detailRow, null);
    expect(card.primaryCategory).toEqual({
      id: 'cat-1',
      slug: 'mess',
      name: 'Mess',
      icon: 'utensils',
    });
    expect(card.coverImageUrl).toBe('https://cdn.example.com/cover.jpg');
  });

  it('falls back to the first image when none is marked as the cover', () => {
    const card = toPlaceCard({ ...detailRow, images: [otherImage] }, null);
    expect(card.coverImageUrl).toBe('https://cdn.example.com/other.jpg');
  });

  it('has no cover image when there are none', () => {
    expect(toPlaceCard({ ...detailRow, images: [] }, null).coverImageUrl).toBeNull();
  });

  it('has no primary category when there are none (never happens via the API, but never crashes)', () => {
    expect(toPlaceCard({ ...detailRow, categories: [] }, null).primaryCategory).toBeNull();
  });

  it('verified reflects verificationStatus', () => {
    expect(toPlaceCard({ ...detailRow, verificationStatus: 'PENDING' }, null).verified).toBe(false);
  });

  it('carries the given distance, or null without one', () => {
    expect(toPlaceCard(detailRow, 850).distanceMeters).toBe(850);
    expect(toPlaceCard(detailRow, null).distanceMeters).toBeNull();
  });
});

describe('toPlaceDetail', () => {
  it('matches the public detail schema', () => {
    expect(placeDetailSchema.safeParse(toPlaceDetail(detailRow)).success).toBe(true);
  });

  it('maps every nested collection', () => {
    const detail = toPlaceDetail(detailRow);
    expect(detail.categories).toEqual([
      { id: 'cat-1', slug: 'mess', name: 'Mess', icon: 'utensils', isPrimary: true },
      { id: 'cat-2', slug: 'restaurant', name: 'Restaurant', icon: null, isPrimary: false },
    ]);
    expect(detail.amenities).toEqual([{ id: 'am-1', key: 'wifi', name: 'WiFi', icon: 'wifi' }]);
    expect(detail.hours).toHaveLength(1);
    expect(detail.priceOptions).toHaveLength(1);
    expect(detail.images).toHaveLength(2);
  });

  it('never leaks a staff-only field', () => {
    const detail = toPlaceDetail(detailRow) as Record<string, unknown>;
    expect(detail.status).toBeUndefined();
    expect(detail.createdById).toBeUndefined();
    expect(detail.isDemo).toBeUndefined();
  });
});

describe('toAdminListItem', () => {
  it('matches the admin list-item schema', () => {
    expect(adminPlaceListItemSchema.safeParse(toAdminListItem(adminRow)).success).toBe(true);
  });

  it('omits the nested collections', () => {
    const item = toAdminListItem(adminRow) as Record<string, unknown>;
    expect(item.categories).toBeUndefined();
    expect(item.hours).toBeUndefined();
    expect(item.images).toBeUndefined();
  });

  it('formats dates as ISO strings', () => {
    const item = toAdminListItem(adminRow);
    expect(item.createdAt).toBe('2026-07-01T00:00:00.000Z');
    expect(item.publishedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(item.lastVerifiedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('leaves publishedAt and lastVerifiedAt null when unset', () => {
    const item = toAdminListItem({ ...adminRow, publishedAt: null, lastVerifiedAt: null });
    expect(item.publishedAt).toBeNull();
    expect(item.lastVerifiedAt).toBeNull();
  });
});

describe('toAdminPlace', () => {
  it('matches the full admin schema, with every nested collection', () => {
    const admin = toAdminPlace(adminRow);
    expect(adminPlaceSchema.safeParse(admin).success).toBe(true);
    expect(admin.categories).toHaveLength(2);
    expect(admin.images).toHaveLength(2);
  });
});
