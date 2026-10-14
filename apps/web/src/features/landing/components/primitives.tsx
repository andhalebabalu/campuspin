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
  'group/cta relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-lg bg-accent-600 px-6 text-sm font-semibold text-white shadow-md shadow-accent-600/25 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-accent-650 hover:shadow-lg hover:shadow-accent-600/30 active:translate-y-0 before:pointer-events-none before:absolute before:inset-y-0 before:-left-1/3 before:w-1/4 before:-skew-x-12 before:bg-white/30 before:transition-transform before:duration-700 hover:before:translate-x-[600%] [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:translate-x-0.5';

/** Link styled as the outlined companion to {@link CTA_CLASSES}. */
export const CTA_OUTLINE_CLASSES =
  'inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-primary-800/70 bg-surface/90 px-6 text-sm font-semibold text-primary-800 backdrop-blur transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-primary-800 hover:bg-primary-50 hover:shadow-md';

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

/** The small green pill above a section heading ("WHY CAMPUSPIN"). */
export function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p
      className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] uppercase ${
        dark ? 'bg-accent-600 text-white' : 'bg-accent-50 text-accent-600'
      }`}
    >
      {children}
    </p>
  );
}

/** Eyebrow pill + heading + optional lead, used at the top of every section. */
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
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="text-3xl leading-tight font-extrabold text-primary-800 sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="max-w-xl text-base leading-relaxed text-body">{lead}</p>}
    </div>
  );
}

/** A handwritten note with a curly arrow, like the ones pencilled around the mockups. */
export function HandNote({
  children,
  className = '',
  arrow = 'down-left',
  light = false,
}: {
  children: ReactNode;
  className?: string;
  arrow?: 'down-left' | 'up-right' | 'down-right' | 'none';
  light?: boolean;
}) {
  const stroke = light ? 'stroke-white' : 'stroke-primary-800';
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none flex flex-col font-[family-name:var(--font-hand)] text-2xl leading-tight ${
        light ? 'text-white' : 'text-primary-800'
      } ${className}`}
    >
      {arrow === 'up-right' && (
        <svg
          viewBox="0 0 60 50"
          className={`ml-auto h-10 w-12 fill-none ${stroke}`}
          strokeWidth="2"
        >
          <path d="M4 46 C 14 20, 30 30, 26 18 C 22 8, 40 6, 54 6" strokeLinecap="round" />
          <path d="M46 1 L55 6 L47 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span className="-rotate-6">{children}</span>
      {arrow === 'down-left' && (
        <svg viewBox="0 0 60 50" className={`h-10 w-12 fill-none ${stroke}`} strokeWidth="2">
          <path d="M56 4 C 40 10, 46 26, 34 30 C 22 34, 14 30, 6 44" strokeLinecap="round" />
          <path d="M3 34 L6 45 L16 41" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {arrow === 'down-right' && (
        <svg
          viewBox="0 0 60 50"
          className={`ml-auto h-10 w-12 fill-none ${stroke}`}
          strokeWidth="2"
        >
          <path d="M4 4 C 20 10, 14 26, 26 30 C 38 34, 46 30, 54 44" strokeLinecap="round" />
          <path d="M44 41 L54 45 L57 34" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
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
