import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import {
  CafePhone,
  LaptopDashboard,
  MessMenuPhone,
  NearbyPhone,
} from '@/features/landing/components/device-mockups';
import {
  Container,
  CTA_CLASSES,
  CTA_OUTLINE_CLASSES,
  Eyebrow,
  HandNote,
  IconChip,
  SectionHeading,
  stagger,
} from '@/features/landing/components/primitives';
import {
  EXPLORE_TILES,
  PLATFORM_FEATURES,
  SAMPLE_TESTIMONIALS,
} from '@/features/landing/lib/landing-content';

/** "Why CampusPin: Your campus. One platform." with the four feature cards. */
export function WhySection() {
  return (
    <section id="about" aria-labelledby="why-title" className="scroll-mt-20 py-16 lg:py-20">
      <Container className="grid gap-10 lg:grid-cols-[0.85fr_2fr] lg:items-center">
        <div data-reveal className="flex flex-col gap-4">
          <Eyebrow>Why CampusPin</Eyebrow>
          <h2
            id="why-title"
            className="text-3xl leading-tight font-extrabold text-primary-800 sm:text-4xl"
          >
            Your campus.
            <br />
            One platform.
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-body">
            From finding a mess to booking a room, CampusPin brings everything you need: nearby,
            verified and in one easy-to-use platform.
          </p>
          <Link href="#features" className={`${CTA_CLASSES} w-fit`}>
            Explore All Features
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_FEATURES.map((feature, index) => (
            <li key={feature.label} data-reveal style={stagger(index, 100)}>
              <Link
                href={feature.href}
                data-spotlight
                className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-xs transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <IconChip icon={feature.icon} tone={feature.tone} className="!rounded-full" />
                <h3 className="text-base leading-snug font-bold text-primary-800">
                  {feature.label.split(' ')[0]}
                  <br />
                  {feature.label.split(' ').slice(1).join(' ')}
                </h3>
                <p className="text-sm leading-relaxed text-body">{feature.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** The navy "Student Life" band with three phones. */
export function StudentLifeSection() {
  return (
    <section
      aria-labelledby="life-title"
      className="relative isolate overflow-hidden bg-linear-to-br from-primary-900 via-primary-800 to-primary-700 text-white"
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-20 size-[30rem] rounded-full bg-primary-500/20 blur-3xl" />
        <div className="absolute -right-20 -bottom-40 size-[30rem] rounded-full bg-accent-400/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.08)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_at_right,black_20%,transparent_70%)]" />
      </div>

      <Container className="grid items-center gap-12 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:py-10">
        <div data-reveal className="flex flex-col gap-5">
          <Eyebrow dark>Student Life</Eyebrow>
          <h2
            id="life-title"
            className="text-3xl leading-tight font-extrabold sm:text-4xl lg:text-[2.6rem]"
          >
            Everything around
            <br />
            your campus,
            <br />
            <span className="text-accent-400">connected.</span>
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-primary-100 sm:text-base">
            Discover nearby places, explore services, order food, book appointments and much more.
            CampusPin makes your college life simpler, smarter and better.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.register} className={CTA_CLASSES}>
              <Icon name="bell" className="size-4" />
              Get Started
            </Link>
            <Link
              href={ROUTES.search}
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/50 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              <Icon name="search" className="size-4" />
              Explore Places
            </Link>
          </div>
        </div>

        <div className="relative flex items-end justify-center gap-3 pt-10 sm:gap-4 lg:pt-14">
          <CafePhone className="hidden h-[22rem] w-44 translate-y-6 -rotate-3 sm:flex" />
          <MessMenuPhone className="relative z-10 h-[24rem] w-48" />
          <NearbyPhone className="h-[22rem] w-44 translate-y-6 rotate-3" />
          <HandNote
            arrow="up-right"
            light
            className="absolute -top-2 right-0 flex-col-reverse text-[1.7rem] lg:-right-4"
          >
            Simple. Fast. Useful.
          </HandNote>
        </div>
      </Container>
    </section>
  );
}

/** "Explore everything around you": ten tiles, each a working search or page. */
export function ExploreSection() {
  return (
    <section id="features" aria-labelledby="explore-title" className="scroll-mt-20 py-16 lg:py-20">
      <Container className="flex flex-col gap-8">
        <SectionHeading
          id="explore-title"
          eyebrow="Explore more"
          title="Explore everything around you"
        />
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {EXPLORE_TILES.map((tile, index) => (
            <li key={tile.label} data-reveal style={stagger(index % 5, 60)}>
              <Link
                href={tile.href}
                data-spotlight
                className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5 transition-all hover:-translate-y-1 hover:border-primary-200 hover:shadow-lg"
              >
                <IconChip
                  icon={tile.icon}
                  tone={tile.tone}
                  className="!rounded-full transition-transform group-hover:scale-110"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-primary-800">{tile.label}</span>
                  <span className="text-xs leading-snug text-muted">{tile.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** A green college building with students around it: the "stronger campus" card. Decorative. */
function CampusIllustration() {
  return (
    <svg viewBox="0 0 200 120" className="h-28 w-auto" aria-hidden="true">
      <ellipse cx="100" cy="112" rx="90" ry="7" className="fill-accent-400/20" />
      <rect x="50" y="46" width="100" height="62" rx="3" className="fill-accent-400" />
      <path d="M44 48 L100 18 L156 48Z" className="fill-accent-600" />
      <rect x="92" y="6" width="2" height="14" className="fill-accent-700" />
      <path d="M94 6 L106 10 L94 14Z" className="fill-rose-600" />
      <circle cx="100" cy="36" r="6" className="fill-white" />
      {[60, 76, 116, 132].map((x) =>
        [56, 76].map((y) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="10"
            height="12"
            rx="1.5"
            className="fill-white/85"
          />
        )),
      )}
      <path d="M90 108 V86 a10 10 0 0 1 20 0 V108Z" className="fill-accent-700" />
      {[
        [26, 'fill-primary-600'],
        [172, 'fill-amber-600'],
      ].map(([x, fill]) => (
        <g key={String(x)}>
          <circle cx={Number(x)} cy="84" r="5" className={String(fill)} />
          <rect x={Number(x) - 5} y="90" width="10" height="18" rx="4" className={String(fill)} />
        </g>
      ))}
      <circle cx="30" cy="62" r="12" className="fill-accent-400/60" />
      <rect x="29" y="70" width="2" height="38" className="fill-accent-700" />
      <circle cx="170" cy="58" r="14" className="fill-accent-400/60" />
      <rect x="169" y="68" width="2" height="40" className="fill-accent-700" />
    </svg>
  );
}

/** "For business: Order. Print. Book. Skip the queue." */
export function BusinessSection() {
  return (
    <section
      id="for-businesses"
      aria-labelledby="business-title"
      className="scroll-mt-20 py-16 lg:py-20"
    >
      <Container className="grid items-center gap-12 lg:grid-cols-[1.05fr_1.2fr_0.8fr] lg:gap-10">
        <div data-reveal className="flex flex-col gap-4">
          <Eyebrow>For Business</Eyebrow>
          <h2
            id="business-title"
            className="text-3xl leading-tight font-extrabold text-primary-800 lg:text-[2.1rem]"
          >
            <span className="lg:whitespace-nowrap">Order. Print. Book.</span>
            <br />
            Skip the queue.
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-body">
            Let your business reach thousands of students. Get more visibility, more customers and
            grow with CampusPin.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.registerBusiness} className={`${CTA_CLASSES} !px-5`}>
              <Icon name="store" className="size-4" />
              List Your Business
            </Link>
            <Link href={ROUTES.businessLogin} className={`${CTA_OUTLINE_CLASSES} !px-5`}>
              Business Login
            </Link>
          </div>
        </div>

        <div data-reveal className="pt-10 pr-8 pl-2 sm:pr-12">
          <LaptopDashboard />
        </div>

        <div
          data-reveal
          className="relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-linear-to-br from-accent-50 to-primary-50 p-6"
        >
          <p className="font-display text-base leading-snug font-bold text-primary-800">
            Student Community
            <br />+ Local Businesses
            <br />= <span className="text-accent-600">A Stronger Campus</span>
          </p>
          <div className="flex items-end justify-between gap-2">
            <CampusIllustration />
            <HandNote arrow="none" className="text-xl">
              Together
              <br />
              We Grow!
            </HandNote>
          </div>
        </div>
      </Container>
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_TONES = [
  'bg-primary-100 text-primary-800',
  'bg-rose-50 text-rose-600',
  'bg-accent-50 text-accent-600',
  'bg-violet-50 text-violet-600',
];

/**
 * "More than places." The quotes are samples (see SAMPLE_TESTIMONIALS), and the heading says so
 * rather than presenting them as real students' words.
 */
export function TestimonialsSection() {
  return (
    <section aria-labelledby="voices-title" className="pb-16 lg:pb-20">
      <Container className="flex flex-col gap-8">
        <SectionHeading
          id="voices-title"
          eyebrow="What students will love"
          title="More than places. It’s your campus community."
          lead="Sample reviews showing what CampusPin is built for. Real student stories coming soon."
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SAMPLE_TESTIMONIALS.map((item, index) => (
            <li
              key={item.name}
              data-reveal
              style={stagger(index, 100)}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-11 items-center justify-center rounded-full text-sm font-bold ${AVATAR_TONES[index % AVATAR_TONES.length]}`}
                >
                  {initials(item.name)}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-bold text-ink">{item.name}</span>
                  <span className="text-xs text-muted">{item.course}</span>
                </span>
              </div>
              <p className="flex-1 text-sm leading-relaxed text-body">{item.quote}</p>
              <span className="flex gap-0.5 text-amber-600" aria-label="5 out of 5">
                {Array.from({ length: 5 }, (_, star) => (
                  <Icon key={star} name="star" className="size-4 fill-current" />
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
