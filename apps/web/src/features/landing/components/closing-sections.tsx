import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';
import { ROUTES } from '@/constants/routes';
import {
  Container,
  CTA_CLASSES,
  IconChip,
  SectionHeading,
} from '@/features/landing/components/primitives';
import { BUSINESS_BENEFITS, WHY_US } from '@/features/landing/lib/landing-content';

const SAMPLE_KPIS = [
  { label: 'Profile views', value: '2,468', delta: '+12%' },
  { label: 'Enquiries', value: '186', delta: '+8%' },
  { label: 'Rating', value: '4.6', delta: '+0.2' },
];

const SAMPLE_ENQUIRIES = [
  { label: 'Mess & tiffin', when: '2 hours ago', icon: 'utensils', tone: 'amber' },
  { label: 'Room for rent', when: '4 hours ago', icon: 'bed', tone: 'blue' },
  { label: 'Gym membership', when: '5 hours ago', icon: 'dumbbell', tone: 'violet' },
] as const;

/** A picture of the upcoming business dashboard. Sample numbers, labelled as such. */
function DashboardPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-bold text-primary-800">
          <Icon name="store" className="size-4" /> {BRAND.name} Business
        </span>
        <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-semibold text-body">
          Sample preview
        </span>
      </div>
      <div className="grid sm:grid-cols-[120px_1fr]">
        <ul className="hidden flex-col gap-1 border-r border-line p-2 text-xs text-body sm:flex">
          {['Dashboard', 'Listings', 'Enquiries', 'Reviews', 'Profile', 'Settings'].map(
            (item, index) => (
              <li
                key={item}
                className={`rounded-md px-2.5 py-1.5 ${index === 0 ? 'bg-primary-800 font-semibold text-white' : ''}`}
              >
                {item}
              </li>
            ),
          )}
        </ul>
        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-3 gap-3">
            {SAMPLE_KPIS.map((kpi) => (
              <div key={kpi.label} className="rounded-lg border border-line p-2.5">
                <p className="text-[11px] text-muted">{kpi.label}</p>
                <p className="font-display text-lg font-extrabold text-primary-800">{kpi.value}</p>
                <p className="text-[11px] font-semibold text-accent-600">{kpi.delta}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
            <div className="rounded-lg border border-line p-3">
              <p className="text-xs font-semibold text-ink">Views & enquiries</p>
              <svg viewBox="0 0 200 80" className="mt-2 h-24 w-full" aria-hidden="true">
                <path
                  d="M0 70 C 20 60 30 40 50 45 S 80 20 100 35 S 140 10 160 25 S 190 15 200 12 V80 H0Z"
                  className="fill-primary-100"
                />
                <path
                  d="M0 70 C 20 60 30 40 50 45 S 80 20 100 35 S 140 10 160 25 S 190 15 200 12"
                  className="stroke-primary-600"
                  strokeWidth="2"
                  fill="none"
                />
                <path
                  d="M0 75 C 30 70 50 60 80 62 S 130 45 160 50 S 190 40 200 38"
                  className="stroke-accent-400"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  fill="none"
                />
              </svg>
            </div>
            <ul className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <li className="text-xs font-semibold text-ink">Recent enquiries</li>
              {SAMPLE_ENQUIRIES.map((row) => (
                <li key={row.label} className="flex items-center gap-2">
                  <IconChip icon={row.icon} tone={row.tone} size="sm" className="!size-7" />
                  <span className="flex flex-col">
                    <span className="text-xs font-medium text-ink">{row.label}</span>
                    <span className="text-[11px] text-muted">{row.when}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        Preview of the upcoming business dashboard, with sample numbers.
      </figcaption>
    </figure>
  );
}

export function BusinessSection() {
  return (
    <section
      id="for-businesses"
      aria-labelledby="business-title"
      className="scroll-mt-20 border-y border-line bg-surface py-20"
    >
      <Container className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.4fr]">
        <div className="flex flex-col gap-6">
          <SectionHeading
            id="business-title"
            eyebrow="For businesses"
            title={
              <>
                Grow your business
                <br />
                around campus.
              </>
            }
            lead="Reach students who are actively looking for the products and services you offer."
          />
          <ul className="flex flex-col gap-2.5">
            {BUSINESS_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2.5 text-sm text-ink">
                <Icon name="check" className="size-5 text-accent-600" />
                {benefit}
              </li>
            ))}
          </ul>
          <Link href={ROUTES.suggestPlace} className={`${CTA_CLASSES} w-fit`}>
            List your business
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </div>
        <DashboardPreview />
      </Container>
    </section>
  );
}

export function WhyUsSection() {
  return (
    <section id="about" aria-labelledby="why-title" className="scroll-mt-20 py-20">
      <Container className="flex flex-col gap-10">
        <SectionHeading
          id="why-title"
          eyebrow={`Why ${BRAND.name}`}
          title="Everything around your campus. Connected."
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_US.map((item) => (
            <li
              key={item.title}
              className="flex gap-4 rounded-xl border border-line bg-surface p-5 shadow-xs"
            >
              <IconChip icon={item.icon} tone={item.tone} />
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-bold text-primary-800">{item.title}</h3>
                <p className="text-sm leading-relaxed text-body">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function CtaBand() {
  return (
    <section aria-labelledby="cta-title" className="bg-primary-800 text-white">
      <Container className="relative flex flex-col items-center gap-5 overflow-hidden py-16 text-center">
        <svg
          viewBox="0 0 200 120"
          className="pointer-events-none absolute right-0 bottom-0 hidden h-40 w-auto opacity-15 md:block"
          aria-hidden="true"
        >
          <path
            d="M20 120V60l40-25 40 25v60M100 120V40l40-25 40 25v80M40 80h10v15H40zM70 80h10v15H70zM120 60h10v15h-10zM150 60h10v15h-10zM120 90h10v15h-10zM150 90h10v15h-10z"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
        </svg>
        <h2 id="cta-title" className="text-3xl font-extrabold sm:text-4xl">
          Make your campus experience better.
        </h2>
        <p className="text-primary-200">{BRAND.tagline}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={ROUTES.colleges} className={CTA_CLASSES}>
            Explore your campus
            <Icon name="arrowRight" className="size-4" />
          </Link>
          <Link
            href={ROUTES.register}
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/60 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Join {BRAND.name}
          </Link>
        </div>
      </Container>
    </section>
  );
}
