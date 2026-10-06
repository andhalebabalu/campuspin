import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { TONES, type Tone } from '@/features/landing/lib/landing-content';

const CHIP_SIZES = {
  sm: 'size-8 rounded-md [&>svg]:size-4',
  md: 'size-11 rounded-lg [&>svg]:size-5',
  lg: 'size-14 rounded-xl [&>svg]:size-6',
} as const;

/**
 * Link styled as the landing page's green call-to-action button: lifts on hover, with a light
 * sweeping across it.
 */
export const CTA_CLASSES =
  'group/cta relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-md bg-accent-600 px-5 text-sm font-semibold text-white shadow-md shadow-accent-600/25 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-accent-650 hover:shadow-lg hover:shadow-accent-600/30 active:translate-y-0 before:pointer-events-none before:absolute before:inset-y-0 before:-left-1/3 before:w-1/4 before:-skew-x-12 before:bg-white/30 before:transition-transform before:duration-700 hover:before:translate-x-[600%] [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:translate-x-0.5';

/** Link styled as the outlined companion to {@link CTA_CLASSES}. */
export const CTA_OUTLINE_CLASSES =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md border border-primary-800/80 bg-surface/80 px-5 text-sm font-semibold text-primary-800 backdrop-blur transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-primary-800 hover:bg-primary-50 hover:shadow-md';

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

/** Style for the nth item of a row that reveals on scroll: each one a beat after the last. */
export function stagger(index: number, stepMs = 80): CSSProperties {
  return { '--reveal-delay': `${index * stepMs}ms` } as CSSProperties;
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
    <div
      data-reveal
      className={`flex flex-col gap-3 ${align === 'center' ? 'items-center text-center' : ''}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent-600">{eyebrow}</p>
      <h2 id={id} className="text-3xl font-extrabold leading-tight text-primary-800 sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="max-w-xl text-base leading-relaxed text-body">{lead}</p>}
    </div>
  );
}

/** Page-width container shared by every section so edges line up. */
export function Container({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
  );
}
