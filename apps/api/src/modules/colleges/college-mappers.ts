import type {
  AdminCollege,
  AdminCollegeListItem,
  CollegeCard,
  CollegeDetail,
  CollegeImage,
  CollegeStatus,
  VerificationStatus,
} from '@platform/contracts';

/**
 * Row -> response mapping, written out field by field. A response is built from an explicit list,
 * never by spreading a database row, so a column added to the table later cannot leak into the API
 * by accident (a private note, a flag) and public responses can never carry a staff-only field.
 */

export interface CardRow {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  city: string;
  state: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  verificationStatus: VerificationStatus;
}

export interface DetailRow extends CardRow {
  description: string | null;
  address: string;
  country: string;
  website: string | null;
  latitude: number;
  longitude: number;
  serviceRadiusMeters: number;
  images: Array<{ id: string; imageUrl: string; altText: string | null; sortOrder: number }>;
}

export interface AdminRow extends DetailRow {
  status: CollegeStatus;
  isDemo: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toCollegeCard(
  row: CardRow,
  placeCount: number,
  distanceMeters: number | null,
): CollegeCard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.shortName,
    city: row.city,
    state: row.state,
    logoUrl: row.logoUrl,
    coverImageUrl: row.coverImageUrl,
    verified: row.verificationStatus === 'VERIFIED',
    placeCount,
    distanceMeters,
  };
}

const toImage = (image: DetailRow['images'][number]): CollegeImage => ({
  id: image.id,
  imageUrl: image.imageUrl,
  altText: image.altText,
  sortOrder: image.sortOrder,
});

export function toCollegeDetail(row: DetailRow, placeCount: number): CollegeDetail {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.shortName,
    city: row.city,
    state: row.state,
    logoUrl: row.logoUrl,
    coverImageUrl: row.coverImageUrl,
    verified: row.verificationStatus === 'VERIFIED',
    placeCount,
    description: row.description,
    address: row.address,
    country: row.country,
    website: row.website,
    latitude: row.latitude,
    longitude: row.longitude,
    serviceRadiusMeters: row.serviceRadiusMeters,
    images: row.images.map(toImage),
  };
}

/** The admin list omits the image gallery (fetch a single college for that). */
export function toAdminListItem(row: AdminRow, placeCount: number): AdminCollegeListItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.shortName,
    city: row.city,
    state: row.state,
    logoUrl: row.logoUrl,
    coverImageUrl: row.coverImageUrl,
    verified: row.verificationStatus === 'VERIFIED',
    placeCount,
    description: row.description,
    address: row.address,
    country: row.country,
    website: row.website,
    latitude: row.latitude,
    longitude: row.longitude,
    serviceRadiusMeters: row.serviceRadiusMeters,
    status: row.status,
    verificationStatus: row.verificationStatus,
    isDemo: row.isDemo,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminCollege(row: AdminRow, placeCount: number): AdminCollege {
  return { ...toAdminListItem(row, placeCount), images: row.images.map(toImage) };
}
