import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';

/**
 * The band at the top of a page, in the landing page's style: a small pill, a big navy title with
 * one green word, a lead, and the campus photo fading in from the right. `children` sits under the
 * lead (buttons, stats).
 */
export function PageHero({
  eyebrow,
  eyebrowIcon = 'pin',
  title,
  lead,
  children,
  compact = false,
}: {
  eyebrow: string;
  eyebrowIcon?: IconName;
  /** Wrap the green word in `<span className="text-accent-600">`. */
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`relative isolate overflow-hidden ${compact ? 'pb-8' : 'pb-12'}`}>
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-linear-to-b from-primary-100/80 via-primary-50/60 to-canvas" />
        {/* eslint-disable-next-line @next/next/no-img-element -- static hero photo. */}
        <img
          src="/images/hero/campus.jpg"
          alt=""
          className="absolute top-0 right-0 h-full w-full object-cover object-[70%_45%] opacity-35 [mask-image:linear-gradient(to_bottom,black_55%,transparent),linear-gradient(to_right,transparent_10%,black_60%)] [mask-composite:intersect] md:w-[58%] md:opacity-70"
        />
        <div className="absolute inset-0 bg-linear-to-r from-canvas/95 via-canvas/55 to-transparent" />
      </div>
      <div className="mx-auto flex w-full max-w-6xl animate-fade-up flex-col gap-3 px-4 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 ring-1 ring-primary-100">
          <Icon name={eyebrowIcon} className="size-3.5" />
          {eyebrow}
        </span>
        <h1
          className={`max-w-2xl leading-[1.08] font-extrabold text-primary-800 ${
            compact ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl'
          }`}
        >
          {title}
        </h1>
        {lead && <p className="max-w-xl text-base text-body sm:text-lg">{lead}</p>}
        {children}
      </div>
    </section>
  );
}
