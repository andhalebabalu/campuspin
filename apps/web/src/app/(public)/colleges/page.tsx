import {
  COLLEGE_MANAGEMENT,
  COLLEGE_STREAMS,
  type CollegeManagement,
  type CollegeStream,
} from '@platform/contracts';
import type { Metadata } from 'next';
import { CollegeDirectory } from '@/features/colleges/components/college-directory';
import { CollegesHero } from '@/features/colleges/components/colleges-hero';
import { DIRECTORY_PAGE_SIZE, type DirectoryQuery } from '@/features/colleges/lib/directory-query';
import { collegesService } from '@/services/colleges.service';
import { BRAND } from '@/constants/brand';

export const metadata: Metadata = {
  title: 'Colleges',
  description: `Discover colleges in Pune and Ahmednagar districts on ${BRAND.name}, and everything a student needs around them.`,
};

const SORTS: ReadonlyArray<DirectoryQuery['sort']> = ['relevance', 'name', 'popular', 'newest'];

/** A comma-separated URL value, keeping only the values the API accepts. */
function csv<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  return (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is T => (allowed as readonly string[]).includes(part));
}

export default async function CollegesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    city?: string;
    stream?: string;
    management?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const raw = await searchParams;
  const query: DirectoryQuery = {
    q: raw.q?.trim() ?? '',
    city: raw.city?.trim() ?? '',
    stream: csv<CollegeStream>(raw.stream, COLLEGE_STREAMS),
    management: csv<CollegeManagement>(raw.management, COLLEGE_MANAGEMENT),
    sort: SORTS.find((value) => value === raw.sort) ?? 'relevance',
    page: Math.max(1, Number.parseInt(raw.page ?? '1', 10) || 1),
  };

  const [result, facets] = await Promise.all([
    collegesService.list({
      ...(query.q ? { q: query.q } : {}),
      ...(query.city ? { city: query.city } : {}),
      stream: query.stream,
      management: query.management,
      sort: query.sort,
      page: query.page,
      limit: DIRECTORY_PAGE_SIZE,
    }),
    // The header counts and filter options are a convenience: the list works without them.
    collegesService.facets().then(
      (response) => response.data,
      () => null,
    ),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <CollegesHero facets={facets} />
      <CollegeDirectory
        initialColleges={result.data}
        initialMeta={
          result.meta ?? {
            page: query.page,
            limit: DIRECTORY_PAGE_SIZE,
            total: result.data.length,
            totalPages: 1,
          }
        }
        initialQuery={query}
        facets={facets}
      />
    </main>
  );
}
