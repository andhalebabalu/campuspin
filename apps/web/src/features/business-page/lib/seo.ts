import type { PlaceDetail, PublicBusiness } from '@platform/contracts';
import type { Metadata } from 'next';
import { BRAND } from '@/constants/brand';
import { env } from '@/lib/env';
import { DAY_NAMES } from './open-status';

export const absoluteUrl = (path: string) => new URL(path, env.NEXT_PUBLIC_SITE_URL).toString();

/** One line for search results and link previews; never anything about the owner. */
export function describe(
  name: string,
  category: string | null,
  place: Pick<PlaceDetail, 'city' | 'nearbyColleges'>,
  description: string | null,
): string {
  const near = place.nearbyColleges[0];
  const lead = `${category ? `${category} ` : ''}${near ? `near ${near.shortName ?? near.name}` : `in ${place.city}`}`;
  const base = description
    ? description.replace(/\s+/g, ' ').trim()
    : `Discover ${name}, ${lead.trim()}, on ${BRAND.name}.`;
  return base.length > 160 ? `${base.slice(0, 157).trimEnd()}…` : base;
}

/** Title, description, canonical URL, Open Graph and Twitter tags for a business or place page. */
export function pageMetadata({
  name,
  category,
  description,
  path,
  image,
}: {
  name: string;
  category: string | null;
  description: string;
  path: string;
  /** A photo to preview with; omitted when the route generates its own `opengraph-image`. */
  image?: string | null;
}): Metadata {
  const url = absoluteUrl(path);
  const title = category ? `${name} · ${category}` : name;
  return {
    title: name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: BRAND.name,
      title,
      description,
      locale: 'en_IN',
      ...(image ? { images: [{ url: image, alt: name }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/**
 * schema.org LocalBusiness for search engines: public facts only (name, address, hours, rating).
 * Serialised with `<` escaped so a name can never close the script tag.
 */
export function localBusinessJsonLd(
  place: PlaceDetail,
  business: Pick<
    PublicBusiness,
    'name' | 'logoUrl' | 'coverUrl' | 'phone' | 'ratingAverage' | 'ratingCount'
  > | null,
  url: string,
): string {
  const ratingCount = business ? business.ratingCount : place.ratingCount;
  const ratingAverage = business ? business.ratingAverage : place.ratingAverage;
  const image = business?.coverUrl ?? place.coverImageUrl ?? business?.logoUrl ?? undefined;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business?.name ?? place.name,
    url,
    ...(image ? { image } : {}),
    ...(place.description ? { description: place.description } : {}),
    ...((business?.phone ?? place.phone) ? { telephone: business?.phone ?? place.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: place.address,
      addressLocality: place.city,
      addressRegion: place.state,
      addressCountry: 'IN',
    },
    geo: { '@type': 'GeoCoordinates', latitude: place.latitude, longitude: place.longitude },
    ...(ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: ratingAverage,
            reviewCount: ratingCount,
          },
        }
      : {}),
    ...(place.hours.some((hour) => !hour.isClosed)
      ? {
          openingHoursSpecification: place.hours
            .filter((hour) => !hour.isClosed)
            .map((hour) => ({
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: DAY_NAMES[hour.dayOfWeek - 1],
              opens: hour.is24Hours ? '00:00' : hour.openTime,
              closes: hour.is24Hours ? '23:59' : hour.closeTime,
            })),
        }
      : {}),
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
