import type { Metadata } from 'next';
import { CollegeDirectory } from '@/features/colleges/components/college-directory';
import { collegesService, type CollegeListParams } from '@/services/colleges.service';
import { BRAND } from '@/constants/brand';

export const metadata: Metadata = {
  title: 'Colleges',
  description: `Find your college on ${BRAND.name} to see everything discovered around it.`,
};

const SORTS: ReadonlyArray<NonNullable<CollegeListParams['sort']>> = ['name', 'popular', 'newest'];

export default async function CollegesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const raw = await searchParams;
  const q = raw.q?.trim() ?? '';
  const sort = SORTS.find((value) => value === raw.sort) ?? 'name';
  const page = Math.max(1, Number.parseInt(raw.page ?? '1', 10) || 1);

  const result = await collegesService.list({ ...(q ? { q } : {}), sort, page });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-ink">Colleges</h1>
        <p className="text-body">Pick your college to see everything discovered around it.</p>
      </div>

      <CollegeDirectory
        initialColleges={result.data}
        initialMeta={result.meta ?? { page, limit: 20, total: result.data.length, totalPages: 1 }}
        initialQuery={{ q, sort, page }}
      />
    </main>
  );
}
