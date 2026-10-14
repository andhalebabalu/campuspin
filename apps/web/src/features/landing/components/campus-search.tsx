'use client';

import type { CollegeCard } from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/icon';
import { CollegePicker, type PickedCollege } from '@/features/colleges/components/college-picker';
import { IconChip } from '@/features/landing/components/primitives';
import { QUICK_CATEGORIES } from '@/features/landing/lib/landing-content';
import { searchHref } from '@/features/search/lib/search-filters';

const FIELD =
  'h-14 w-full rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-muted';

/**
 * "Find what you need, close to you": city + college + keyword, handed off to `/search`. The city
 * narrows the college suggestions; the quick-category chips carry the chosen college too, so
 * "Mess" after picking a college means "messes near that college".
 */
export function CampusSearch({ colleges }: { colleges: CollegeCard[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [picked, setPicked] = useState<PickedCollege | null>(null);
  const college = picked?.slug ?? '';
  const queryId = useId();
  const cityId = useId();

  const cities = useMemo(
    () => [...new Set(colleges.map((c) => c.city).filter(Boolean))].sort(),
    [colleges],
  );
  const suggestions = city ? colleges.filter((c) => c.city === city) : colleges;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    router.push(searchHref({ q: q.trim(), college }));
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-[0_24px_60px_-28px_rgb(4_35_73/0.35)] sm:p-7">
      <h2 className="text-xl font-extrabold text-primary-800 sm:text-2xl">
        Find what you need, close to you.
      </h2>
      <p className="mt-1 text-sm text-body">
        Search by your <span className="text-accent-600">college</span>, explore listings, check
        distance and location.
      </p>

      <form
        onSubmit={handleSubmit}
        role="search"
        className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-[0.8fr_1fr_1.5fr_auto]"
      >
        <div className="relative">
          <label htmlFor={cityId} className="sr-only">
            Select city
          </label>
          <Icon
            name="pin"
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-primary-800"
          />
          <select
            id={cityId}
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
              setPicked(null);
            }}
            className={`${FIELD} appearance-none pr-10 pl-12 font-medium`}
          >
            <option value="">All cities</option>
            {cities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Icon
            name="chevronDown"
            className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted"
          />
        </div>

        <CollegePicker
          value={picked}
          onChange={setPicked}
          suggestions={suggestions}
          label="Select college"
          hideLabel
          icon="graduation"
          placeholder="Select College"
          inputClassName={`${FIELD} pr-10 pl-12`}
        />

        <div className="relative md:col-span-2 lg:col-span-1">
          <label htmlFor={queryId} className="sr-only">
            Search for mess, rooms, services
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
          />
          <input
            id={queryId}
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search for mess, rooms, services..."
            className={`${FIELD} pr-4 pl-12`}
          />
        </div>

        <button
          type="submit"
          className="inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-accent-600 px-7 text-sm font-semibold text-white shadow-md shadow-accent-600/25 transition-colors hover:bg-accent-650 md:col-span-2 lg:col-span-1"
        >
          Search
          <Icon name="navigation" className="size-4" />
        </button>
      </form>

      <ul className="mt-5 flex flex-wrap gap-2.5" aria-label="Popular categories">
        {QUICK_CATEGORIES.map((chip) => (
          <li key={chip.label}>
            <Link
              href={searchHref({ category: chip.slug ?? '', college })}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface py-1.5 pr-4 pl-1.5 text-sm font-medium text-ink transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-sm"
            >
              <IconChip icon={chip.icon} tone={chip.tone} size="sm" />
              {chip.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
