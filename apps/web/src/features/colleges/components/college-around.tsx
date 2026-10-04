'use client';

import type { CollegeNearbyCategory, PageMeta, PlaceCard } from '@platform/contracts';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { CollegePlaceList } from '@/features/places/components/college-place-list';
import {
  distanceRange,
  formatDistance,
  summarizeAmenities,
  type AmenitySummary,
} from '../lib/college-profile';

export interface CollegeAroundProps {
  collegeSlug: string;
  collegeName: string;
  nearby: readonly CollegeNearbyCategory[];
  initialPlaces: PlaceCard[];
  initialMeta: PageMeta;
  radiusMeters: number;
}

const SECTION = 'rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6';

/**
 * The "what is around this college" half of the page: an at-a-glance grid of student amenities
 * (the nearest of each, or "not listed yet" — never a made-up "on campus"), photo tiles for what IS
 * listed, and the full list below, which any tile filters.
 */
export function CollegeAround({
  collegeSlug,
  collegeName,
  nearby,
  initialPlaces,
  initialMeta,
  radiusMeters,
}: CollegeAroundProps) {
  const [category, setCategory] = useState('');
  const amenities = summarizeAmenities(nearby);
  const listed = amenities.filter((amenity) => amenity.count > 0);

  function show(amenity: AmenitySummary) {
    if (!amenity.filterSlug) return;
    setCategory(amenity.filterSlug);
    document.getElementById('places')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <section
        id="amenities"
        aria-labelledby="amenities-heading"
        className={`${SECTION} scroll-mt-32`}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="amenities-heading" className="text-xl font-bold text-ink">
              Student amenities
            </h2>
            <span className="rounded-full border border-success-600/30 bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700">
              Within {formatDistance(radiusMeters)}
            </span>
          </div>
          <p className="text-xs text-muted">Distance to the nearest one we know of</p>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {amenities.map((amenity) => {
            const has = amenity.count > 0 && amenity.nearestMeters !== null;
            const body = (
              <>
                <span
                  className={`flex size-11 items-center justify-center rounded-full ${amenity.tone}`}
                >
                  <Icon name={amenity.icon} className="size-5" />
                </span>
                <span className="text-sm font-semibold text-ink">{amenity.label}</span>
                {has ? (
                  <>
                    <span className="text-sm font-medium text-body">
                      {formatDistance(amenity.nearestMeters ?? 0)}
                    </span>
                    <span className="text-xs text-muted">
                      {amenity.count} {amenity.count === 1 ? 'place' : 'places'} nearby
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-muted">—</span>
                    <span className="text-xs text-muted">Not listed yet</span>
                  </>
                )}
              </>
            );
            return (
              <li key={amenity.key}>
                {has ? (
                  <button
                    type="button"
                    onClick={() => show(amenity)}
                    className="flex h-full w-full flex-col items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-4 text-center transition-shadow hover:border-control hover:shadow-md"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex h-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-canvas px-3 py-4 text-center opacity-80">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {listed.length < amenities.length && (
          <p className="mt-4 text-xs text-muted">
            Know a mess, PG or library near {collegeName} that is missing?{' '}
            <a href="/suggest-a-place" className="font-medium text-action hover:underline">
              Suggest it
            </a>{' '}
            and staff will add it after a quick check.
          </p>
        )}
      </section>

      {listed.length > 0 && (
        <section id="nearby" aria-labelledby="nearby-heading" className={`${SECTION} scroll-mt-32`}>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2 id="nearby-heading" className="text-xl font-bold text-ink">
              Nearby places
            </h2>
            <span className="rounded-full border border-success-600/30 bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700">
              {listed.reduce((sum, amenity) => sum + amenity.count, 0)} listed
            </span>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listed.map((amenity) => (
              <li key={amenity.key}>
                <button
                  type="button"
                  onClick={() => show(amenity)}
                  className="group flex w-full flex-col overflow-hidden rounded-lg border border-line bg-surface text-left transition-shadow hover:shadow-md"
                >
                  <span className="relative block aspect-[16/9] w-full overflow-hidden bg-subtle">
                    {amenity.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local stock photo, not a remote image.
                      <img
                        src={amenity.image}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className={`flex size-full items-center justify-center ${amenity.tone}`}>
                        <Icon name={amenity.icon} className="size-10" />
                      </span>
                    )}
                    <span className="absolute bottom-2 right-2 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-semibold text-white">
                      {distanceRange(amenity.nearestMeters ?? 0, amenity.farthestMeters ?? 0)}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-ink">{amenity.label}</span>
                      <span className="text-xs text-muted">
                        {amenity.count} {amenity.count === 1 ? 'place' : 'places'} · {amenity.hint}
                      </span>
                    </span>
                    <Icon
                      name="arrowRight"
                      className="size-4 shrink-0 text-muted group-hover:text-ink"
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Photos are illustrative, not of the listed places.
          </p>
        </section>
      )}

      <section id="places" aria-labelledby="places-heading" className={`${SECTION} scroll-mt-32`}>
        <h2 id="places-heading" className="mb-5 text-xl font-bold text-ink">
          All places around {collegeName}
        </h2>
        <CollegePlaceList
          collegeSlug={collegeSlug}
          initialPlaces={initialPlaces}
          initialMeta={initialMeta}
          categorySlug={category}
          onCategoryChange={setCategory}
          categories={nearby.map((entry) => ({
            slug: entry.slug,
            name: entry.name,
            count: entry.count,
          }))}
        />
      </section>
    </>
  );
}
