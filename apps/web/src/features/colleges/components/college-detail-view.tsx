import type {
  CollegeDetail,
  CollegeNearbyCategory,
  PageMeta,
  PlaceCard,
} from '@platform/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { VerifiedBadge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { collegeFacts, collegePhoto, formatDistance, kindLabel } from '../lib/college-profile';
import { CollegeAround } from './college-around';
import { CollegePlaceholder } from './college-placeholder';
import { ShareLinks } from './share-links';

export interface CollegeDetailViewProps {
  college: CollegeDetail;
  nearby: readonly CollegeNearbyCategory[];
  initialPlaces: PlaceCard[];
  initialMeta: PageMeta;
}

const CARD = 'rounded-xl border border-line bg-surface shadow-xs';

const TABS = [
  { href: '#overview', label: 'Overview' },
  { href: '#amenities', label: 'Amenities' },
  { href: '#nearby', label: 'Nearby places' },
  { href: '#places', label: 'All places' },
  { href: '#location', label: 'Location' },
];

function Fact({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <div className="text-sm font-medium text-ink">{value}</div>
      </div>
    </div>
  );
}

function aboutText(college: CollegeDetail, facts: ReturnType<typeof collegeFacts>): string[] {
  const kind = kindLabel(facts.kind);
  const lead =
    `${college.name} is a ${kind ? `${kind.toLowerCase()} ` : ''}college in ${college.city}, ${college.state}` +
    (facts.university ? `, affiliated to ${facts.university}.` : '.');
  const courses = facts.courses ? `It offers ${facts.courses} programmes.` : null;
  return [lead, ...(courses ? [courses] : []), ...facts.about];
}

/**
 * One college's page: who it is (from the official listing), what is around it for a student, and
 * how to get there. Everything shown comes from the data we hold; where something is not known yet
 * (contact details, the exact campus pin), the page says so instead of filling it in.
 */
export function CollegeDetailView({
  college,
  nearby,
  initialPlaces,
  initialMeta,
}: CollegeDetailViewProps) {
  const facts = collegeFacts(college.description);
  const photo = collegePhoto(college);
  const kind = kindLabel(facts.kind);
  const { latitude: lat, longitude: lng } = college;
  const d = 0.008;
  const mapSrc =
    `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d * 1.6},${lat - d},${lng + d * 1.6},${lat + d}` +
    `&layer=mapnik&marker=${lat},${lng}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const osmLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  const nearestBus = nearby.find((entry) => entry.slug === 'bus');

  return (
    <div className="flex flex-col gap-6">
      {/* ── Hero ──────────────────────────────────────────────────────────────────────────── */}
      <section className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Link
            href={ROUTES.colleges}
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-body hover:text-ink"
          >
            <Icon name="arrowLeft" className="size-4" />
            Back to colleges
          </Link>
          <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">{college.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {kind && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700">
                <Icon name="check" className="size-3.5" />
                {kind}
              </span>
            )}
            {college.verified ? (
              <VerifiedBadge />
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-body">
                <Icon name="info" className="size-3.5" />
                Not verified yet
              </span>
            )}
          </div>
          <p className="flex items-start gap-2 text-body">
            <Icon name="pin" className="mt-0.5 size-5 shrink-0 text-action" />
            <span>
              {college.address}
              {college.address.toLowerCase().includes(college.city.toLowerCase())
                ? ''
                : `, ${college.city}`}
              , {college.state}
            </span>
          </p>
          <div className="grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-3">
            <Fact
              icon="graduation"
              label="Affiliated to"
              value={facts.university ?? 'Not listed'}
            />
            <Fact icon="building" label="Type" value={facts.kind ?? 'Not listed'} />
            <Fact
              icon="pin"
              label="Places around"
              value={`${college.placeCount} within ${formatDistance(college.serviceRadiusMeters)}`}
            />
          </div>
        </div>

        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-line bg-subtle shadow-md">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- no remote-image domains configured yet.
            <img src={photo} alt={`${college.name} campus`} className="size-full object-cover" />
          ) : (
            <CollegePlaceholder seed={college.slug} />
          )}
          {college.images.length > 0 && (
            <a
              href="#photos"
              className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-md hover:bg-subtle"
            >
              <Icon name="image" className="size-4" />
              View gallery ({college.images.length})
            </a>
          )}
        </div>
      </section>

      {/* ── Tabs ──────────────────────────────────────────────────────────────────────────── */}
      <nav
        aria-label="On this page"
        className="sticky top-0 z-10 -mx-4 overflow-x-auto border-b border-line bg-canvas/95 px-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-surface/95 sm:px-2"
      >
        <ul className="flex min-w-max gap-1">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <a
                href={tab.href}
                className="inline-block border-b-2 border-transparent px-4 py-3.5 text-sm font-medium text-body transition-colors hover:border-action hover:text-action"
              >
                {tab.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Main column ─────────────────────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-6">
          <section
            id="overview"
            aria-labelledby="about-heading"
            className={`${CARD} scroll-mt-32 p-5 sm:p-6`}
          >
            <h2 id="about-heading" className="mb-3 text-xl font-bold text-ink">
              About college
            </h2>
            <div className="flex flex-col gap-3 text-body">
              {aboutText(college, facts).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-1 gap-5 border-t border-line pt-5 sm:grid-cols-2 xl:grid-cols-4">
              <Fact icon="book" label="Courses" value={facts.courses ?? 'Not listed yet'} />
              <Fact
                icon="graduation"
                label="University"
                value={facts.university ?? 'Not listed yet'}
              />
              <Fact icon="building" label="Type" value={facts.kind ?? 'Not listed yet'} />
              <Fact
                icon="target"
                label="Map pin"
                value={facts.locationApproximate ? 'Approximate' : 'Campus location'}
              />
            </div>
            {(facts.source || facts.locationApproximate) && (
              <div className="mt-5 flex flex-col gap-1.5 rounded-lg bg-canvas px-4 py-3 text-xs text-body">
                {facts.source && (
                  <p>
                    Source: official {facts.source}
                    {facts.sourceUrl && (
                      <>
                        {' '}
                        (
                        <a
                          href={facts.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-action hover:underline"
                        >
                          document
                        </a>
                        )
                      </>
                    )}
                    .
                  </p>
                )}
                {facts.locationApproximate && (
                  <p>
                    The map pin is approximate ({facts.locationNote}), so distances below are
                    measured from there, not from the campus gate.
                  </p>
                )}
              </div>
            )}
          </section>

          {college.images.length > 0 && (
            <section
              id="photos"
              aria-labelledby="photos-heading"
              className={`${CARD} scroll-mt-32 p-5 sm:p-6`}
            >
              <h2 id="photos-heading" className="mb-4 text-xl font-bold text-ink">
                Photos
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {college.images.map((image) => (
                  <div key={image.id} className="aspect-[4/3] overflow-hidden rounded-lg bg-subtle">
                    {/* eslint-disable-next-line @next/next/no-img-element -- no remote-image domains configured yet. */}
                    <img
                      src={image.imageUrl}
                      alt={image.altText ?? `${college.name} — photo`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          <CollegeAround
            collegeSlug={college.slug}
            collegeName={college.shortName ?? college.name}
            nearby={nearby}
            initialPlaces={initialPlaces}
            initialMeta={initialMeta}
            radiusMeters={college.serviceRadiusMeters}
          />
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────────────────────── */}
        <aside className="flex flex-col gap-6">
          <section
            id="location"
            aria-label="Location"
            className={`${CARD} scroll-mt-32 overflow-hidden`}
          >
            <iframe
              title={`Map of ${college.name}`}
              src={mapSrc}
              loading="lazy"
              className="h-60 w-full border-0"
            />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-700">
                  <Icon name="navigation" className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">Get directions</p>
                  <p className="text-xs text-muted">
                    {facts.locationApproximate
                      ? 'The pin is approximate: confirm the campus once you are nearby.'
                      : 'Find the best route to the campus.'}
                  </p>
                </div>
              </div>
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent-600 text-sm font-semibold text-white transition-colors hover:bg-accent-650"
              >
                <Icon name="navigation" className="size-4" />
                Open in Maps
              </a>
              <a
                href={osmLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-action hover:underline"
              >
                View larger map <Icon name="external" className="size-3.5" />
              </a>
            </div>
          </section>

          <section aria-labelledby="quick-heading" className={`${CARD} p-5`}>
            <h2 id="quick-heading" className="mb-4 text-lg font-bold text-ink">
              Quick info
            </h2>
            <dl className="flex flex-col gap-4">
              {[
                { icon: 'building' as const, label: 'Type', value: facts.kind ?? 'Not listed' },
                {
                  icon: 'graduation' as const,
                  label: 'Affiliation',
                  value: facts.university ?? 'Not listed',
                },
                {
                  icon: 'pin' as const,
                  label: 'Location',
                  value: `${college.city}, ${college.state}`,
                },
                {
                  icon: 'bus' as const,
                  label: 'Nearest bus stop',
                  value: nearestBus
                    ? `${nearestBus.nearest.name} · ${formatDistance(nearestBus.nearestMeters)}`
                    : 'Not listed yet',
                },
              ].map((row) => (
                <div key={row.label} className="flex items-start gap-3">
                  <Icon name={row.icon} className="mt-0.5 size-5 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted">{row.label}</dt>
                    <dd className="text-sm font-medium text-ink">{row.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="contact-heading" className={`${CARD} p-5`}>
            <h2 id="contact-heading" className="mb-3 text-lg font-bold text-ink">
              Contact
            </h2>
            {college.website ? (
              <a
                href={college.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary-700 text-sm font-semibold text-white hover:bg-primary-800"
              >
                <Icon name="globe" className="size-4" />
                Visit official website
              </a>
            ) : (
              <p className="text-sm text-body">
                Phone, email and website are not listed yet. The college&apos;s own office is the
                best source until staff add them.
              </p>
            )}
          </section>

          <section aria-labelledby="share-heading" className={`${CARD} p-5`}>
            <h2 id="share-heading" className="mb-3 text-lg font-bold text-ink">
              Share this college
            </h2>
            <ShareLinks title={college.name} path={ROUTES.collegeDetail(college.slug)} />
          </section>
        </aside>
      </div>

      {/* ── Explore more ────────────────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-primary-800 px-6 py-6 text-white sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Icon name="graduation" className="size-6" />
          </span>
          <div>
            <p className="text-lg font-bold">Explore more colleges in {college.city}</p>
            <p className="text-sm text-white/75">
              Find colleges, and everything a student needs around them.
            </p>
          </div>
        </div>
        <Link
          href={ROUTES.colleges}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-primary-800 hover:bg-primary-50"
        >
          Browse all colleges <Icon name="arrowRight" className="size-4" />
        </Link>
      </section>
    </div>
  );
}
