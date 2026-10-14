'use client';

import type { PlaceCard } from '@platform/contracts';
import Link from 'next/link';
import { useRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { Container, Eyebrow } from '@/features/landing/components/primitives';
import { searchHref } from '@/features/search/lib/search-filters';
import { categoryImage } from '@/utils/category-image';

function Card({ place }: { place: PlaceCard }) {
  const fallback = categoryImage(place.primaryCategory?.slug, place.id);
  const image = place.coverImageUrl ?? fallback;
  return (
    <Link
      href={ROUTES.placeDetail(place.slug)}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs transition-all hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-subtle">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- local stock photo or uploaded cover.
          <img
            src={image}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted">
            <Icon name="image" className="size-8" />
          </span>
        )}
        {!place.coverImageUrl && fallback && (
          <span className="absolute bottom-2 left-2 rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-medium text-white">
            Illustrative photo
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <h3 className="line-clamp-1 text-sm font-bold text-ink">{place.name}</h3>
        {place.primaryCategory && (
          <p className="flex items-center gap-1.5 text-xs text-body">
            <Icon name="tag" className="size-3.5 text-muted" />
            {place.primaryCategory.name}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-body">
          <Icon name="pin" className="size-3.5 text-muted" />
          {place.city}
        </p>
        {place.ratingCount > 0 && (
          <p className="flex items-center gap-1 text-xs font-semibold text-ink">
            <Icon name="star" className="size-3.5 fill-current text-amber-600" />
            {place.ratingAverage.toFixed(1)}
            <span className="font-normal text-muted">({place.ratingCount})</span>
          </p>
        )}
      </div>
    </Link>
  );
}

/** "For students: New around campus": real places in a row that scrolls with arrows or a swipe. */
export function NewAroundCampus({ places }: { places: PlaceCard[] }) {
  const rail = useRef<HTMLUListElement>(null);
  if (places.length === 0) return null;

  const scroll = (direction: -1 | 1) => {
    const element = rail.current;
    if (element)
      element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'smooth' });
  };

  const arrow =
    'absolute top-1/2 z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-primary-800 shadow-md transition-colors hover:bg-primary-50 md:flex';

  return (
    <section id="for-students" aria-labelledby="new-title" className="scroll-mt-20 pb-16 lg:pb-20">
      <Container>
        <div className="rounded-3xl bg-primary-50/70 p-5 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div data-reveal className="flex flex-col gap-2">
              <Eyebrow>For Students</Eyebrow>
              <h2 id="new-title" className="text-2xl font-extrabold text-primary-800 sm:text-3xl">
                New around campus
              </h2>
              <p className="max-w-md text-sm text-body">
                Discover mess, cafés, study spaces, rooms and more, all in one place.
              </p>
            </div>
            <Link
              href={searchHref({ sort: 'newest' })}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800"
            >
              View All
              <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>

          <div className="relative mt-6">
            <button
              type="button"
              onClick={() => scroll(-1)}
              className={`${arrow} -left-5`}
              aria-label="Previous places"
            >
              <Icon name="chevronLeft" className="size-5" />
            </button>
            <ul
              ref={rail}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {places.map((place) => (
                <li
                  key={place.id}
                  className="w-[78%] shrink-0 snap-start sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)]"
                >
                  <Card place={place} />
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => scroll(1)}
              className={`${arrow} -right-5`}
              aria-label="Next places"
            >
              <Icon name="chevronRight" className="size-5" />
            </button>
          </div>
        </div>
      </Container>
    </section>
  );
}
