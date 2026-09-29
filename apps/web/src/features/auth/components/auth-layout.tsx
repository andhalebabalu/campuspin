import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';

export type AuthAudience = 'student' | 'business' | 'any';

const ASIDE: Record<AuthAudience, { title: string; points: ReadonlyArray<[IconName, string]> }> = {
  any: {
    title: 'Everything around your college, in one place.',
    points: [
      ['search', 'Find messes, PGs, libraries and services near campus'],
      ['users', 'A student community and a campus buy & sell'],
      ['store', 'Businesses get a page students can share'],
    ],
  },
  student: {
    title: 'Your campus, sorted.',
    points: [
      ['search', 'Discover places near your college, with real student reviews'],
      ['heart', 'Save the mess, PG and library you keep going back to'],
      ['users', 'Ask your campus community, buy and sell with students'],
    ],
  },
  business: {
    title: 'Reach the students next door.',
    points: [
      ['globe', 'A free business page with its own link, ready for WhatsApp'],
      ['star', 'Collect reviews and answer student enquiries'],
      ['chart', 'See how many students view, call and find you'],
    ],
  },
};

/**
 * The frame of every sign-in and sign-up page: the form on the left, what the account gets on the
 * right (desktop only; on a phone the form is the whole page).
 */
export function AuthLayout({
  audience,
  title,
  subtitle,
  children,
}: {
  audience: AuthAudience;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const aside = ASIDE[audience];
  return (
    <main className="flex flex-1 items-stretch justify-center bg-canvas px-4 py-10 sm:px-6 lg:py-16">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-line bg-surface shadow-sm lg:grid-cols-[1fr_minmax(0,0.9fr)]">
        <div className="flex flex-col justify-center gap-8 px-5 py-10 sm:px-10 lg:px-14">
          <div className="flex flex-col gap-2">
            {audience !== 'any' && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                <Icon name={audience === 'business' ? 'store' : 'user'} className="size-3.5" />
                {audience === 'business' ? 'Business account' : 'Student account'}
              </span>
            )}
            <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="text-body">{subtitle}</p>}
          </div>
          {children}
        </div>
        <aside
          className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-primary-800 p-12 text-white lg:flex"
          aria-hidden="true"
        >
          <div className="absolute -top-24 -right-24 size-72 rounded-full bg-primary-600/40 blur-2xl" />
          <div className="absolute -bottom-28 -left-16 size-72 rounded-full bg-accent-600/30 blur-2xl" />
          <p className="relative text-sm font-semibold tracking-wide text-primary-200 uppercase">
            {BRAND.name}
          </p>
          <div className="relative flex flex-col gap-6">
            <p className="text-2xl leading-snug font-bold">{aside.title}</p>
            <ul className="flex flex-col gap-4">
              {aside.points.map(([icon, text]) => (
                <li key={text} className="flex items-start gap-3 text-primary-100">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <Icon name={icon} className="size-4" />
                  </span>
                  <span className="pt-1 text-sm">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-sm text-primary-200">{BRAND.tagline}</p>
        </aside>
      </div>
    </main>
  );
}
