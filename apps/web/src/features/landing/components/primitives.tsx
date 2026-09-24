import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { TONES, type Tone } from '@/features/landing/lib/landing-content';

const CHIP_SIZES = {
  sm: 'size-8 rounded-md [&>svg]:size-4',
  md: 'size-11 rounded-lg [&>svg]:size-5',
  lg: 'size-14 rounded-xl [&>svg]:size-6',
} as const;

/** Link styled as the landing page's green call-to-action button. */
export const CTA_CLASSES =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-650';

/** Link styled as the outlined companion to {@link CTA_CLASSES}. */
export const CTA_OUTLINE_CLASSES =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md border border-primary-800 bg-surface px-5 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-50';

/** A tinted square with an icon in it: the landing page's recurring visual unit. */
export function IconChip({
  icon,
  tone,
  size = 'md',
  className = '',
}: {
  icon: IconName;
  tone: Tone;
  size?: keyof typeof CHIP_SIZES;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${CHIP_SIZES[size]} ${TONES[tone]} ${className}`}
    >
      <Icon name={icon} />
    </span>
  );
}

/** Small green uppercase label + heading + optional lead, used at the top of every section. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  id,
  align = 'left',
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  id?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={`flex flex-col gap-3 ${align === 'center' ? 'items-center text-center' : ''}`}>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent-600">{eyebrow}</p>
      <h2 id={id} className="text-3xl font-extrabold leading-tight text-primary-800 sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="max-w-xl text-base leading-relaxed text-body">{lead}</p>}
    </div>
  );
}

export function ComingSoonBadge() {
  return (
    <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-subtle whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
      Coming soon
    </span>
  );
}

/** Page-width container shared by every section so edges line up. */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
  );
}
