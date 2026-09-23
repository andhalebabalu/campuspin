import type { CollegeDetail } from '@platform/contracts';
import { Card } from '@/components/ui/card';
import { VerifiedBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';

export function CollegeDetailView({ college }: { college: CollegeDetail }) {
  const cover = college.coverImageUrl ?? college.images[0]?.imageUrl ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div className="aspect-[3/1] w-full overflow-hidden rounded-lg bg-subtle">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- foundation phase: no remote-image domains configured yet.
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-lg font-medium text-neutral-400">
            {college.name}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-ink">{college.name}</h1>
          {college.verified && <VerifiedBadge />}
        </div>
        {college.shortName && <p className="text-body">{college.shortName}</p>}
        <p className="text-body">
          {college.address}, {college.city}, {college.state}, {college.country}
        </p>
        {college.website && (
          <a
            href={college.website}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-sm font-medium text-action hover:text-action-hover"
          >
            Visit website ↗
          </a>
        )}
      </div>

      {college.description && (
        <Card className="p-6">
          <p className="text-body whitespace-pre-line">{college.description}</p>
        </Card>
      )}

      {college.images.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-ink">Photos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {college.images.map((image) => (
              <div key={image.id} className="aspect-square overflow-hidden rounded-md bg-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element -- foundation phase: no remote-image domains configured yet. */}
                <img
                  src={image.imageUrl}
                  alt={image.altText ?? `${college.name} — photo`}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">
          Places around {college.shortName ?? college.name}
        </h2>
        <EmptyState
          title={`${college.placeCount} ${college.placeCount === 1 ? 'place' : 'places'} tracked so far`}
          description="Rooms, PGs, messes and more are coming to this college hub in a later phase."
        />
      </div>
    </div>
  );
}
