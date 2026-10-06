import type { CollegeCard } from '@platform/contracts';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { Container } from '@/features/landing/components/primitives';

/**
 * The name up to its first comma ("Fergusson College", "Marathwada Mitramandal's College of
 * Commerce"); when that part is only the trust ("X Education Society's, Y College") the next part.
 */
function shortLabel(college: Pick<CollegeCard, 'name' | 'shortName'>): string {
  if (college.shortName) return college.shortName;
  const parts = college.name
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const onlyTrust = /\b(society|trust|mandal|sanstha|foundation|parishad)(['’]s)?$/i;
  const label =
    (parts[0] && onlyTrust.test(parts[0]) && parts[1] ? parts[1] : parts[0]) ?? college.name;
  return label.length > 46 ? `${label.slice(0, 44)}…` : label;
}

/**
 * Real colleges on CampusPin, gliding past: each one links to its page. The list is shown twice in
 * a row so the loop has no seam; hovering pauses it, and with reduced motion it is a plain
 * scrollable row instead.
 */
export function CollegeMarquee({ colleges }: { colleges: CollegeCard[] }) {
  const items = colleges.slice(0, 24);
  if (items.length < 6) return null;
  const row = (hidden: boolean) =>
    items.map((college) => (
      <li key={`${hidden ? 'b' : 'a'}-${college.id}`} aria-hidden={hidden || undefined}>
        <Link
          href={ROUTES.collegeDetail(college.slug)}
          tabIndex={hidden ? -1 : undefined}
          className="flex items-center gap-2.5 rounded-full border border-line bg-surface py-2 pr-4 pl-2 text-sm whitespace-nowrap text-ink shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <Icon name="graduation" className="size-4" />
          </span>
          <span className="font-semibold">{shortLabel(college)}</span>
          <span className="text-xs text-muted">{college.city}</span>
        </Link>
      </li>
    ));

  return (
    <section aria-label="Colleges on CampusPin" className="border-y border-line bg-surface/60 py-8">
      <Container className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p data-reveal className="text-sm font-semibold text-body">
          Students from these colleges are already finding their way around
        </p>
        <Link
          href={ROUTES.colleges}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800"
        >
          All colleges
          <Icon name="arrowRight" className="size-4" />
        </Link>
      </Container>
      <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] motion-reduce:overflow-x-auto">
        <ul className="flex w-max animate-marquee gap-3 px-3 group-hover:[animation-play-state:paused] motion-reduce:animate-none">
          {row(false)}
          {row(true)}
        </ul>
      </div>
    </section>
  );
}
