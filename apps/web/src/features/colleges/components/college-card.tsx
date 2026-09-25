import type { CollegeCard as CollegeCardData } from '@platform/contracts';
import Link from 'next/link';
import { VerifiedBadge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { collegePhoto } from '../lib/college-profile';
import { STREAM_STYLE, managementLabel, streamLabel } from '../lib/college-streams';
import { CollegePlaceholder } from './college-placeholder';

/** One college in the directory: its photo (or a drawing saying there is none), stream, town and type. */
export function CollegeCard({ college }: { college: CollegeCardData }) {
  const photo = collegePhoto(college);
  const primary = college.streams[0] ?? 'other';
  const style = STREAM_STYLE[primary];
  const courses =
    college.courses ?? college.streams.map((stream) => streamLabel(stream)).join(', ');

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs transition-shadow hover:shadow-md">
      <Link
        href={ROUTES.collegeDetail(college.slug)}
        className="relative block aspect-[16/9] w-full overflow-hidden bg-subtle"
        tabIndex={-1}
        aria-hidden="true"
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- no remote-image domains configured yet.
          <img
            src={photo}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <CollegePlaceholder seed={college.slug} size="sm" />
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${style.tone}`}
          >
            <Icon name={style.icon} className="size-3" />
            {streamLabel(primary)}
          </span>
          {college.streams.length > 1 && (
            <span className="text-[11px] font-medium text-muted">
              +{college.streams.length - 1} more
            </span>
          )}
          {college.verified && <VerifiedBadge />}
        </div>

        <h3 className="text-base font-semibold leading-snug text-ink">
          <Link
            href={ROUTES.collegeDetail(college.slug)}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {college.shortName ?? college.name}
          </Link>
        </h3>

        <p className="flex items-center gap-1.5 text-sm text-body">
          <Icon name="pin" className="size-4 shrink-0 text-muted" />
          {college.city}
        </p>

        <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-line pt-3 text-xs">
          <div className="flex min-w-0 items-start gap-2">
            <Icon name="book" className="mt-0.5 size-4 shrink-0 text-muted" />
            <span className="line-clamp-2 text-body">{courses}</span>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="building" className="mt-0.5 size-4 shrink-0 text-muted" />
            <span className="flex flex-col">
              <span className="text-muted">Type</span>
              <span className="font-medium text-ink">{managementLabel(college.management)}</span>
            </span>
          </div>
        </div>

        <Link
          href={ROUTES.collegeDetail(college.slug)}
          className="relative z-10 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-canvas text-sm font-medium text-action transition-colors hover:border-action hover:bg-primary-50"
        >
          View details <Icon name="arrowRight" className="size-4" />
        </Link>
      </div>
    </article>
  );
}
