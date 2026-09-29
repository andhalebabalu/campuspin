import type { PlaceDetail, PublicBusiness } from '@platform/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { VerifiedBadge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';
import { ROUTES } from '@/constants/routes';
import { EnquiryForm } from '@/features/places/components/enquiry-form';
import { PlaceReviews } from '@/features/reviews/components/place-reviews';
import { PlaceServicesSection } from '@/features/services/components/place-services-section';
import { SavePlaceButton } from '@/features/services/components/save-place-button';
import { UNIT_LABELS, formatPrice } from '@/utils/format-price';
import { HoursList, NearbyColleges } from './info-parts';
import { OpenStatusPill } from './open-status-pill';
import { PhotoGallery } from './photo-gallery';
import { PlaceMap } from './place-map';
import { ShareMenu } from './share-menu';
import { PageViewTracker, TrackedLink } from './tracking';

/** What the page shows about the business behind the place; null for a directory-only place. */
export type PageBusiness = Pick<
  PublicBusiness,
  | 'slug'
  | 'name'
  | 'description'
  | 'category'
  | 'logoUrl'
  | 'coverUrl'
  | 'phone'
  | 'whatsapp'
  | 'email'
  | 'website'
  | 'instagramUrl'
  | 'facebookUrl'
  | 'verified'
  | 'ratingAverage'
  | 'ratingCount'
> & { branches: PublicBusiness['branches'] };

const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

/** wa.me wants the full number without "+": a bare 10-digit Indian mobile gets the 91 prefix. */
export function whatsappLink(phone: string, text: string): string {
  let number = phone.replace(/\D/g, '');
  if (number.length === 10) number = `91${number}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function directionsLink(
  place: Pick<PlaceDetail, 'googleMapsUrl' | 'latitude' | 'longitude'>,
) {
  return (
    place.googleMapsUrl ??
    `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex text-amber-600" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} viewBox="0 0 20 20" className="size-4" fill="currentColor">
          <path
            opacity={value >= star - 0.25 ? 1 : value >= star - 0.75 ? 0.55 : 0.2}
            d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9z"
          />
        </svg>
      ))}
    </span>
  );
}

function Section({
  id,
  title,
  icon,
  children,
  action,
}: {
  id?: string;
  title?: string;
  icon?: IconName;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-7"
    >
      {title && (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-ink sm:text-xl">
            {icon && (
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Icon name={icon} className="size-4" />
              </span>
            )}
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function InfoRow({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon name={icon} className="mt-0.5 size-4 text-muted" />
      <div className="min-w-0 flex-1 break-words text-body">{children}</div>
    </div>
  );
}

const CTA_BASE =
  'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors';

/**
 * The public page of a business, or of a directory place: a mini website with a hero, quick
 * actions, services and prices, photos, reviews, hours, contact and a map. The same view serves
 * `/business/<slug>` (with `business`), `/places/<slug>` and the owner's preview (`preview`: no
 * counting, no saving).
 */
export function BusinessPageView({
  place,
  business,
  pageUrl,
  preview = false,
}: {
  place: PlaceDetail;
  business: PageBusiness | null;
  /** Absolute URL of this page, for sharing. */
  pageUrl: string;
  preview?: boolean;
}) {
  const name = business?.name ?? place.name;
  const trackSlug = business && !preview ? business.slug : null;
  const phone = business?.phone ?? place.phone;
  const whatsapp = business?.whatsapp ?? null;
  const email = business?.email ?? place.email;
  const website = business?.website ?? place.website;
  const description = business?.description ?? place.description;
  const cover = business?.coverUrl ?? place.coverImageUrl ?? place.images[0]?.imageUrl ?? null;
  const category = business?.category?.name ?? place.primaryCategory?.name ?? null;
  const ratingAverage = business ? business.ratingAverage : place.ratingAverage;
  const ratingCount = business ? business.ratingCount : place.ratingCount;
  const verified = business ? business.verified : place.verified;
  const otherBranches = business?.branches.filter((branch) => branch.id !== place.id) ?? [];
  const shareText = `${name}${category ? ` · ${category}` : ''} on ${BRAND.name}`;
  const directions = directionsLink(place);
  const socials: Array<{ href: string; icon: IconName; label: string }> = [];
  if (business?.instagramUrl) {
    socials.push({ href: business.instagramUrl, icon: 'instagram', label: 'Instagram' });
  }
  if (business?.facebookUrl) {
    socials.push({ href: business.facebookUrl, icon: 'facebook', label: 'Facebook' });
  }
  if (website) socials.push({ href: website, icon: 'globe', label: 'Website' });
  if (whatsapp) {
    socials.push({
      href: whatsappLink(whatsapp, `Hi! I found ${name} on ${BRAND.name}.`),
      icon: 'whatsapp',
      label: 'WhatsApp',
    });
  }

  const ctas = (
    <>
      {phone && (
        <TrackedLink
          href={`tel:${digits(phone)}`}
          slug={trackSlug}
          type="PHONE_CLICK"
          placeId={place.id}
          className={`${CTA_BASE} bg-action text-white hover:bg-action-hover`}
        >
          <Icon name="phone" className="size-4" /> Call
        </TrackedLink>
      )}
      {whatsapp && (
        <TrackedLink
          href={whatsappLink(whatsapp, `Hi! I found ${name} on ${BRAND.name}.`)}
          slug={trackSlug}
          type="WHATSAPP_CLICK"
          placeId={place.id}
          external
          className={`${CTA_BASE} bg-accent-600 text-white hover:bg-accent-650`}
        >
          <Icon name="whatsapp" className="size-4" /> WhatsApp
        </TrackedLink>
      )}
      <TrackedLink
        href={directions}
        slug={trackSlug}
        type="DIRECTION_CLICK"
        placeId={place.id}
        external
        className={`${CTA_BASE} border border-line bg-surface text-ink hover:bg-subtle`}
      >
        <Icon name="navigation" className="size-4" /> Directions
      </TrackedLink>
    </>
  );

  return (
    <div className="bg-canvas sm:pb-12">
      {trackSlug && <PageViewTracker slug={trackSlug} />}

      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        {/* Cover */}
        <div className="relative h-48 overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 sm:h-64 lg:h-80">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded images live on the API host.
            <img src={cover} alt="" className="size-full object-cover" fetchPriority="high" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-ink/10 to-transparent" />
          <div className="absolute top-4 right-4 flex gap-2">
            {!preview && <SavePlaceButton placeId={place.id} compact />}
            <ShareMenu url={pageUrl} title={name} text={shareText} trackSlug={trackSlug} compact />
          </div>
          {category && (
            <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-semibold text-ink backdrop-blur">
              <Icon name="tag" className="size-3.5" />
              {category}
            </span>
          )}
        </div>

        {/* Identity + quick actions */}
        <div className="relative -mt-12 rounded-3xl border border-line bg-surface p-5 shadow-sm sm:mx-6 sm:-mt-16 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="-mt-14 flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-surface bg-primary-50 text-3xl font-bold text-primary-700 shadow-md sm:-mt-20 sm:size-28">
                {business?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded images live on the API host.
                  <img
                    src={business.logoUrl}
                    alt={`${name} logo`}
                    className="size-full object-cover"
                  />
                ) : (
                  <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl lg:text-4xl">
                    {name}
                  </h1>
                  {verified && <VerifiedBadge />}
                </div>
                {!business && place.business && (
                  <Link
                    href={ROUTES.businessPage(place.business.slug)}
                    className="w-fit text-sm font-medium text-action hover:text-action-hover"
                  >
                    Part of {place.business.name} →
                  </Link>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-body">
                  <a href="#reviews" className="inline-flex items-center gap-1.5 hover:text-ink">
                    {ratingCount > 0 ? (
                      <>
                        <Stars value={ratingAverage} />
                        <span className="font-semibold text-ink">{ratingAverage.toFixed(1)}</span>
                        <span>
                          ({ratingCount} {ratingCount === 1 ? 'review' : 'reviews'})
                        </span>
                      </>
                    ) : (
                      <span>No reviews yet</span>
                    )}
                  </a>
                  <span className="text-line" aria-hidden="true">
                    •
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="pin" className="size-3.5" />
                    {place.city}
                  </span>
                  <OpenStatusPill hours={place.hours} />
                </div>
              </div>
            </div>
            <div className="hidden gap-2 sm:grid sm:grid-cols-4 lg:w-[30rem]">
              {ctas}
              <ShareMenu url={pageUrl} title={name} text={shareText} trackSlug={trackSlug} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-6">
            {description && (
              <Section title="About" icon="info">
                <p className="leading-relaxed whitespace-pre-line text-body">{description}</p>
                {place.amenities.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {place.amenities.map((amenity) => (
                      <span
                        key={amenity.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-xs font-medium text-ink"
                      >
                        <Icon name="check" className="size-3 text-accent-600" />
                        {amenity.name}
                      </span>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {!preview && <PlaceServicesSection placeSlug={place.slug} />}

            <Section title="Services & prices" icon="receipt">
              {place.priceOptions.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {place.priceOptions.map((option) => (
                    <li
                      key={option.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-line p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{option.label}</p>
                        {option.note && <p className="mt-0.5 text-sm text-muted">{option.note}</p>}
                      </div>
                      <p className="shrink-0 text-right font-bold text-primary-700">
                        ₹{option.amount.toLocaleString('en-IN')}
                        <span className="block text-xs font-normal text-muted">
                          / {UNIT_LABELS[option.unit]}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  {formatPrice(place.priceMin, place.priceMax, place.priceUnit) ===
                  'Price on request'
                    ? 'Prices on request. Call or message to ask.'
                    : formatPrice(place.priceMin, place.priceMax, place.priceUnit)}
                </p>
              )}
            </Section>

            {place.images.length > 0 && (
              <Section title="Photos" icon="image">
                <PhotoGallery images={place.images} name={name} />
              </Section>
            )}

            {otherBranches.length > 0 && (
              <Section title="Other branches" icon="store">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {otherBranches.map((branch) => (
                    <li key={branch.id}>
                      <Link
                        href={ROUTES.placeDetail(branch.slug)}
                        className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-subtle"
                      >
                        <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-subtle">
                          {branch.coverImageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element -- uploaded images live on the API host.
                            <img
                              src={branch.coverImageUrl}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">
                            {branch.name}
                          </span>
                          <span className="block truncate text-sm text-muted">
                            {branch.address}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {!preview && place.acceptsEnquiries && (
              <div>
                <EnquiryForm placeId={place.id} placeSlug={place.slug} placeName={place.name} />
              </div>
            )}

            {!preview && (
              <Section id="reviews">
                {otherBranches.length > 0 && (
                  <p className="mb-2 text-sm text-muted">Reviews of {place.name}</p>
                )}
                <PlaceReviews placeId={place.id} placeSlug={place.slug} />
              </Section>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
            <Section title="Business information" icon="store">
              <div className="flex flex-col gap-4">
                <InfoRow icon="pin">
                  {[place.address, place.city, place.state]
                    .filter((part) => part.trim())
                    .join(', ')}
                </InfoRow>
                {phone && (
                  <InfoRow icon="phone">
                    <TrackedLink
                      href={`tel:${digits(phone)}`}
                      slug={trackSlug}
                      type="PHONE_CLICK"
                      placeId={place.id}
                      className="font-medium text-ink hover:text-primary-700"
                    >
                      {phone}
                    </TrackedLink>
                  </InfoRow>
                )}
                {email && (
                  <InfoRow icon="mail">
                    <a
                      href={`mailto:${email}`}
                      className="font-medium text-ink hover:text-primary-700"
                    >
                      {email}
                    </a>
                  </InfoRow>
                )}
                {website && (
                  <InfoRow icon="globe">
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="font-medium text-ink hover:text-primary-700"
                    >
                      {website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    </a>
                  </InfoRow>
                )}
              </div>
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Icon name="clock" className="size-4 text-muted" /> Opening hours
                </h3>
                {place.hours.length > 0 ? (
                  <HoursList hours={place.hours} />
                ) : (
                  <p className="text-sm text-muted">Hours not listed yet. Call to check.</p>
                )}
              </div>
              {place.nearbyColleges.length > 0 && (
                <div className="mt-6 border-t border-line pt-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                    <Icon name="graduation" className="size-4 text-muted" /> Nearby colleges
                  </h3>
                  <NearbyColleges colleges={place.nearbyColleges} />
                </div>
              )}
              {socials.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
                  {socials.map((social) => (
                    <a
                      key={social.label}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={social.label}
                      title={social.label}
                      className="inline-flex size-10 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-primary-300 hover:text-primary-700"
                    >
                      <Icon name={social.icon} className="size-4" />
                    </a>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Location" icon="navigation">
              <PlaceMap latitude={place.latitude} longitude={place.longitude} label={name} />
              <TrackedLink
                href={directions}
                slug={trackSlug}
                type="DIRECTION_CLICK"
                placeId={place.id}
                external
                className={`${CTA_BASE} mt-4 w-full border border-line bg-surface text-ink hover:bg-subtle`}
              >
                <Icon name="navigation" className="size-4" /> Get directions
              </TrackedLink>
            </Section>
          </aside>
        </div>

        {/* Powered by */}
        <div className="mt-10 flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-8 text-center">
          <Link
            href={ROUTES.home}
            className="flex items-center gap-2 text-sm font-semibold text-ink"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the app icon, a static file. */}
            <img src="/icon.png" alt="" className="size-7 rounded-md" />
            Powered by {BRAND.name}
          </Link>
          <p className="text-sm text-muted">{BRAND.tagline}</p>
        </div>
      </div>

      {/* Phone: the quick actions stay under the thumb (sticky, so it stops above the site footer). */}
      <div className="sticky bottom-0 z-40 mt-6 border-t border-line bg-surface/95 p-3 backdrop-blur sm:hidden">
        <div
          className={`grid gap-2 ${phone && whatsapp ? 'grid-cols-3' : phone || whatsapp ? 'grid-cols-2' : 'grid-cols-1'}`}
        >
          {ctas}
        </div>
      </div>
    </div>
  );
}
