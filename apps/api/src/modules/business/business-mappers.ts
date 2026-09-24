import type {
  BusinessLead,
  BusinessListing,
  BusinessProfile,
  LeadReceipt,
  LeadStatus,
  PlaceStatus,
  SubmissionStatus,
  VerificationStatus,
} from '@platform/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  type CategoryRow,
  type ImageRow,
  coverImageUrl,
  primaryCategoryOf,
} from '../places/place-mappers.js';

/**
 * Selects and row -> response mapping for the business dashboard, field by field (the same rule as
 * `place-mappers.ts`): a response never spreads a database row, so nothing leaks by accident.
 */

const PLACE_SUMMARY = { select: { id: true, slug: true, name: true } } as const;

export const PROFILE_SELECT = {
  id: true,
  businessName: true,
  slug: true,
  description: true,
  phone: true,
  email: true,
  website: true,
  logoUrl: true,
  verificationStatus: true,
  createdAt: true,
} satisfies Prisma.BusinessProfileSelect;

export interface ProfileRow {
  id: string;
  businessName: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  verificationStatus: VerificationStatus;
  createdAt: Date;
}

export function toBusinessProfile(row: ProfileRow): BusinessProfile {
  return {
    id: row.id,
    businessName: row.businessName,
    slug: row.slug,
    description: row.description,
    phone: row.phone,
    email: row.email,
    website: row.website,
    logoUrl: row.logoUrl,
    verificationStatus: row.verificationStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

export const LISTING_SELECT = {
  id: true,
  slug: true,
  name: true,
  city: true,
  status: true,
  ratingAverage: true,
  ratingCount: true,
  createdAt: true,
  categories: {
    select: {
      isPrimary: true,
      category: { select: { id: true, slug: true, name: true, icon: true } },
    },
    orderBy: [{ isPrimary: 'desc' }, { category: { name: 'asc' } }],
  },
  images: {
    select: { id: true, imageUrl: true, altText: true, isCover: true, sortOrder: true },
    orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 1,
  },
  // The submission this listing was created through (owner listings always have one).
  createdFrom: {
    select: { status: true, reviewNote: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.PlaceSelect;

export interface ListingRow {
  id: string;
  slug: string;
  name: string;
  city: string;
  status: PlaceStatus;
  ratingAverage: number;
  ratingCount: number;
  createdAt: Date;
  categories: CategoryRow[];
  images: ImageRow[];
  createdFrom: Array<{ status: SubmissionStatus; reviewNote: string | null }>;
}

export function toBusinessListing(
  row: ListingRow,
  enquiries: { total: number; new: number },
): BusinessListing {
  const primary = primaryCategoryOf(row.categories);
  const submission = row.createdFrom[0];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    status: row.status,
    coverImageUrl: coverImageUrl(row.images),
    primaryCategory: primary ? { id: primary.id, slug: primary.slug, name: primary.name } : null,
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    enquiryCount: enquiries.total,
    newEnquiryCount: enquiries.new,
    review: submission ? { status: submission.status, note: submission.reviewNote } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const LEAD_SELECT = {
  id: true,
  place: PLACE_SUMMARY,
  user: { select: { name: true, email: true } },
  message: true,
  contactPhone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadSelect;

export interface LeadRow {
  id: string;
  place: { id: string; slug: string; name: string };
  user: { name: string; email: string };
  message: string;
  contactPhone: string | null;
  status: LeadStatus;
  createdAt: Date;
  updatedAt: Date;
}

export function toBusinessLead(row: LeadRow): BusinessLead {
  return {
    id: row.id,
    place: { id: row.place.id, slug: row.place.slug, name: row.place.name },
    student: { name: row.user.name, email: row.user.email },
    message: row.message,
    contactPhone: row.contactPhone,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const LEAD_RECEIPT_SELECT = {
  id: true,
  place: PLACE_SUMMARY,
  status: true,
  createdAt: true,
} satisfies Prisma.LeadSelect;

export function toLeadReceipt(row: {
  id: string;
  place: { id: string; slug: string; name: string };
  status: LeadStatus;
  createdAt: Date;
}): LeadReceipt {
  return {
    id: row.id,
    place: { id: row.place.id, slug: row.place.slug, name: row.place.name },
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
