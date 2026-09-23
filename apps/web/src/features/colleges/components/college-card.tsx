import type { CollegeCard as CollegeCardData } from '@platform/contracts';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { VerifiedBadge } from '@/components/ui/badge';
import { ROUTES } from '@/constants/routes';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export function CollegeCard({ college }: { college: CollegeCardData }) {
  return (
    <Link href={ROUTES.collegeDetail(college.slug)} className="block">
      <Card hover className="flex h-full flex-col overflow-hidden">
        <div className="aspect-[4/3] w-full bg-subtle">
          {college.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- foundation phase: no remote-image domains configured yet.
            <img
              src={college.coverImageUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-2xl font-bold text-neutral-400">
              {initials(college.name)}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-ink">
              {college.shortName ?? college.name}
            </h3>
            {college.verified && <VerifiedBadge />}
          </div>
          <p className="text-sm text-body">
            {college.city}, {college.state}
          </p>
          <p className="mt-auto text-sm text-muted">
            {college.placeCount} {college.placeCount === 1 ? 'place' : 'places'}
          </p>
        </div>
      </Card>
    </Link>
  );
}
