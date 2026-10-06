'use client';

import type { CollegeCard } from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/icon';
import { CollegePicker, type PickedCollege } from '@/features/colleges/components/college-picker';
import { IconChip } from '@/features/landing/components/primitives';
import { QUICK_CATEGORIES } from '@/features/landing/lib/landing-content';
import { searchHref } from '@/features/search/lib/search-filters';

/**
 * "Find what you need, close to you": a keyword + college search that hands off to `/search`.
 * The quick-category chips carry the chosen college too, so "Mess" after picking a college means
 * "messes near that college".
 */
export function CampusSearch({ colleges }: { colleges: CollegeCard[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<PickedCollege | null>(null);
  const college = picked?.slug ?? '';
  const queryId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    router.push(searchHref({ q: q.trim(), college }));
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-lg sm:p-8">
      <h2 className="text-center text-2xl font-extrabold text-primary-800 sm:text-3xl">
        Find what you need, close to you.
      </h2>

      <form
        onSubmit={handleSubmit}
        role="search"
        className="mt-6 grid gap-3 md:grid-cols-[1.4fr_1fr_auto]"
      >
        <div className="relative">
          <label htmlFor={queryId} className="sr-only">
            What are you looking for?
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-primary-600"
          />
          <input
            id={queryId}
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="What are you looking for?"
            className="h-13 w-full rounded-md border border-control bg-surface pr-4 pl-12 text-base text-ink placeholder:text-muted"
          />
        </div>

        <CollegePicker
          value={picked}
          onChange={setPicked}
          suggestions={colleges}
          label="Select your college"
          hideLabel
          placeholder="Your college or area (e.g. PICT, Kothrud)"
          inputClassName="h-13 rounded-md pr-10 pl-12 text-base"
        />

        <button
          type="submit"
          className="inline-flex h-13 items-center justify-center gap-2 rounded-md bg-accent-600 px-8 text-base font-semibold text-white transition-colors hover:bg-accent-650"
        >
          <Icon name="search" className="size-4 md:hidden" />
          Search
        </button>
      </form>

      <ul className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Popular categories">
        {QUICK_CATEGORIES.map((chip) => (
          <li key={chip.label}>
            <Link
              href={searchHref({ category: chip.slug ?? '', college })}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-3.5 pl-1.5 text-sm font-medium text-ink transition-colors hover:border-primary-300 hover:bg-primary-50"
            >
              <IconChip icon={chip.icon} tone={chip.tone} size="sm" className="!rounded-full" />
              {chip.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
