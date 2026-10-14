import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/icon';

export interface GatePoint {
  icon: IconName;
  title: string;
  body: string;
}

/**
 * What a signed-out (or unverified) visitor sees instead of a members-only page: what it offers,
 * why it is closed, and the one step that opens it. Styled like the landing page's sections.
 */
export function FeatureGate({
  eyebrow,
  title,
  description,
  points,
  image,
  primary,
  secondary,
  note,
}: {
  eyebrow: string;
  title: string;
  description: string;
  points: GatePoint[];
  /** A local photo shown beside the text. */
  image: string;
  primary: { href: string; label: string; icon?: IconName };
  secondary?: { href: string; label: string };
  /** One line under the buttons ("Your phone number stays private."). */
  note?: string;
}) {
  return (
    <div className="grid overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_24px_60px_-28px_rgb(4_35_73/0.35)] lg:grid-cols-[1.15fr_1fr]">
      <div className="flex flex-col gap-6 p-6 sm:p-10">
        <div className="flex flex-col gap-3">
          <p className="w-fit rounded-full bg-accent-50 px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] text-accent-600 uppercase">
            {eyebrow}
          </p>
          <h2 className="text-2xl leading-tight font-extrabold text-primary-800 sm:text-3xl">
            {title}
          </h2>
          <p className="max-w-lg text-sm leading-relaxed text-body sm:text-base">{description}</p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2">
          {points.map((point) => (
            <li key={point.title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Icon name={point.icon} className="size-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-primary-800">{point.title}</span>
                <span className="text-xs leading-relaxed text-body">{point.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Link
              href={primary.href}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent-600 px-6 text-sm font-semibold text-white shadow-md shadow-accent-600/25 transition-all hover:-translate-y-0.5 hover:bg-accent-650"
            >
              {primary.icon && <Icon name={primary.icon} className="size-4" />}
              {primary.label}
            </Link>
            {secondary && (
              <Link
                href={secondary.href}
                className="inline-flex h-12 items-center justify-center rounded-lg border border-primary-800/70 px-6 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-50"
              >
                {secondary.label}
              </Link>
            )}
          </div>
          {note && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Icon name="shield" className="size-3.5" /> {note}
            </p>
          )}
        </div>
      </div>

      <div className="relative hidden min-h-80 lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- local stock photo. */}
        <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-primary-900/70 via-primary-900/10 to-transparent" />
        <p className="absolute right-6 bottom-6 left-6 font-[family-name:var(--font-hand)] text-3xl leading-tight text-white">
          Built for students.
          <br />
          Powered by community.
        </p>
      </div>
    </div>
  );
}
