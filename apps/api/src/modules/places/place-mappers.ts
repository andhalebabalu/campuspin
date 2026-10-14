import type {
  AdminPlace,
  AdminPlaceListItem,
  PlaceAmenitySummary,
  PlaceCard,
  PlaceCategorySummary,
  PlaceDetail,
  PlaceHour,
  PlaceImage,
  PlacePriceOption,
  PlaceStatus,
  PriceUnit,
  VerificationStatus,
} from '@platform/contracts';

/**
 * Row -> response mapping, written out field by field. A response is built from an explicit list,
 * never by spreading a database row, so a column added to the table later cannot leak into the API
 * by accident and public responses can never carry a staff-only field.
 */

export interface CategoryRow {
  isPrimary: boolean;
  category: { id: string; slug: string; name: string; icon: string | null };
}

export interface AmenityRow {
  amenity: { id: string; key: string; name: string; icon: string | null };
}

export interface HourRow {
  id: string;
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
  is24Hours: boolean;
  slotLabel: string | null;
  sortOrder: number;
}

export interface PriceOptionRow {
  id: string;
  label: string;
  amount: number;
  unit: PriceUnit;
  note: string | null;
  sortOrder: number;
}

export interface ImageRow {
  id: string;
  imageUrl: string;
  altText: string | null;
  isCover: boolean;
  sortOrder: number;
}

export interface CardRow {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  verificationStatus: VerificationStatus;
  ratingAverage: number;
  ratingCount: number;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: PriceUnit | null;
  latitude: number;
  longitude: number;
  categories: CategoryRow[];
  images: ImageRow[];
}

export interface DetailRow extends CardRow {
  description: string | null;
  address: string;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  latitude: number;
  longitude: number;
  amenities: AmenityRow[];
  hours: HourRow[];
  priceOptions: PriceOptionRow[];
  businessProfileId: string | null;
}

export interface AdminRow extends DetailRow {
  status: PlaceStatus;
  lastVerifiedAt: Date | null;
  isDemo: boolean;
  createdById: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toCategorySummary = (row: CategoryRow): PlaceCategorySummary => ({
  id: row.category.id,
  slug: row.category.slug,
  name: row.category.name,
  icon: row.category.icon,
  isPrimary: row.isPrimary,
});

const toAmenitySummary = (row: AmenityRow): PlaceAmenitySummary => ({
  id: row.amenity.id,
  key: row.amenity.key,
  name: row.amenity.name,
  icon: row.amenity.icon,
});

const toHour = (row: HourRow): PlaceHour => ({
  id: row.id,
  dayOfWeek: row.dayOfWeek,
  openTime: row.openTime,
  closeTime: row.closeTime,
  isClosed: row.isClosed,
  is24Hours: row.is24Hours,
  slotLabel: row.slotLabel,
  sortOrder: row.sortOrder,
});

const toPriceOption = (row: PriceOptionRow): PlacePriceOption => ({
  id: row.id,
  label: row.label,
  amount: row.amount,
  unit: row.unit,
  note: row.note,
  sortOrder: row.sortOrder,
});

const toImage = (row: ImageRow): PlaceImage => ({
  id: row.id,
  imageUrl: row.imageUrl,
  altText: row.altText,
  isCover: row.isCover,
  sortOrder: row.sortOrder,
});

/** Ordered `isCover` first, then `sortOrder`: the first image (if any) is the one to show as cover. */
export const coverImageUrl = (images: readonly ImageRow[]): string | null =>
  images[0]?.imageUrl ?? null;

export const primaryCategoryOf = (
  categories: readonly CategoryRow[],
): PlaceCard['primaryCategory'] => {
  const primary = categories.find((row) => row.isPrimary) ?? categories[0];
  return primary
    ? {
        id: primary.category.id,
        slug: primary.category.slug,
        name: primary.category.name,
        icon: primary.category.icon,
      }
    : null;
};

export function toPlaceCard(row: CardRow, distanceMeters: number | null): PlaceCard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    state: row.state,
    primaryCategory: primaryCategoryOf(row.categories),
    coverImageUrl: coverImageUrl(row.images),
    verified: row.verificationStatus === 'VERIFIED',
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    priceMin: row.priceMin,
    priceMax: row.priceMax,
    priceUnit: row.priceUnit,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceMeters,
  };
}

export interface PlaceBusinessRow {
  slug: string;
  businessName: string;
  logoUrl: string | null;
  status: string;
  verificationStatus: string;
  _count: { places: number };
}

/** The owning business, but only while its public page could be live (not suspended/rejected). */
export function toPlaceBusiness(row: PlaceBusinessRow | null): PlaceDetail['business'] {
  if (!row || row.status !== 'ACTIVE' || row.verificationStatus === 'REJECTED') return null;
  return {
    slug: row.slug,
    name: row.businessName,
    logoUrl: row.logoUrl,
    verified: row.verificationStatus === 'VERIFIED',
    placeCount: row._count.places,
  };
}

export interface NearbyCollegeRow {
  distanceMeters: number;
  college: { id: string; slug: string; name: string; shortName: string | null };
}

export function toPlaceDetail(
  row: DetailRow,
  business: PlaceBusinessRow | null = null,
  colleges: readonly NearbyCollegeRow[] = [],
): PlaceDetail {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    state: row.state,
    primaryCategory: primaryCategoryOf(row.categories),
    coverImageUrl: coverImageUrl(row.images),
    verified: row.verificationStatus === 'VERIFIED',
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    priceMin: row.priceMin,
    priceMax: row.priceMax,
    priceUnit: row.priceUnit,
    description: row.description,
    address: row.address,
    country: row.country,
    phone: row.phone,
    email: row.email,
    website: row.website,
    googleMapsUrl: row.googleMapsUrl,
    latitude: row.latitude,
    longitude: row.longitude,
    categories: row.categories.map(toCategorySummary),
    amenities: row.amenities.map(toAmenitySummary),
    hours: row.hours.map(toHour),
    priceOptions: row.priceOptions.map(toPriceOption),
    images: row.images.map(toImage),
    acceptsEnquiries: row.businessProfileId !== null,
    nearbyColleges: colleges.map((link) => ({
      ...link.college,
      distanceMeters: link.distanceMeters,
    })),
    business: toPlaceBusiness(business),
  };
}

/** The admin list omits the heavier nested collections (fetch a single place for those). */
export function toAdminListItem(row: AdminRow): AdminPlaceListItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    state: row.state,
    primaryCategory: primaryCategoryOf(row.categories),
    coverImageUrl: coverImageUrl(row.images),
    verified: row.verificationStatus === 'VERIFIED',
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    priceMin: row.priceMin,
    priceMax: row.priceMax,
    priceUnit: row.priceUnit,
    description: row.description,
    address: row.address,
    country: row.country,
    phone: row.phone,
    email: row.email,
    website: row.website,
    googleMapsUrl: row.googleMapsUrl,
    latitude: row.latitude,
    longitude: row.longitude,
    acceptsEnquiries: row.businessProfileId !== null,
    status: row.status,
    verificationStatus: row.verificationStatus,
    lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
    isDemo: row.isDemo,
    createdById: row.createdById,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminPlace(row: AdminRow): AdminPlace {
  return {
    ...toAdminListItem(row),
    categories: row.categories.map(toCategorySummary),
    amenities: row.amenities.map(toAmenitySummary),
    hours: row.hours.map(toHour),
    priceOptions: row.priceOptions.map(toPriceOption),
    images: row.images.map(toImage),
  };
}
