import type { PlaceCard as PlaceCardData } from '@platform/contracts';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import {
  Container,
  CTA_CLASSES,
  CTA_OUTLINE_CLASSES,
  IconChip,
  SectionHeading,
} from '@/features/landing/components/primitives';
import { DAILY_SERVICES } from '@/features/landing/lib/landing-content';
import { PlaceCard } from '@/features/places/components/place-card';
import { searchHref } from '@/features/search/lib/search-filters';

/** The newest real places. Renders nothing when the API is down or has none. */
export function LatestPlacesSection({ places }: { places: PlaceCardData[] }) {
  if (places.length === 0) return null;
  return (
    <section aria-labelledby="latest-title" className="py-20">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            id="latest-title"
            eyebrow="Just added"
            title="New around campus"
            lead="Real places near your college, added by businesses, by students and from open map data."
          />
          <Link
            href={searchHref({ sort: 'newest' })}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800"
          >
            See all places
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </div>
        {/* A swipeable row on phones, a grid from tablets up. */}
        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {places.map((place) => (
            <li key={place.id} className="w-64 shrink-0 snap-start sm:w-auto">
              <PlaceCard place={place} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

const SAMPLE_STEPS = [
  { label: 'Placed', time: '1:02 pm', done: true },
  { label: 'Accepted', time: '1:03 pm', done: true },
  { label: 'Preparing', time: 'now', done: false, current: true },
  { label: 'Ready to pick up', time: '', done: false },
];

/** A phone showing an order being tracked. Sample content, labelled as such. */
function OrderPhone() {
  return (
    <figure className="relative mx-auto w-full max-w-[18rem]">
      <div className="rounded-[2.25rem] bg-primary-900 p-2.5 shadow-xl">
        <div className="overflow-hidden rounded-[1.75rem] bg-surface">
          <div className="flex items-center justify-between bg-primary-800 px-4 pt-5 pb-4 text-white">
            <span className="flex flex-col">
              <span className="text-[11px] text-primary-200">Order A-1042</span>
              <span className="text-sm font-bold">Lunch thali</span>
            </span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold">
              Sample
            </span>
          </div>
          <ol className="flex flex-col gap-3 px-4 py-4">
            {SAMPLE_STEPS.map((step) => (
              <li key={step.label} className="flex items-center gap-3">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                    step.done
                      ? 'bg-accent-600 text-white'
                      : step.current
                        ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-400'
                        : 'bg-subtle text-muted'
                  }`}
                >
                  {step.done ? (
                    <Icon name="check" className="size-3.5" />
                  ) : (
                    <Icon name="clock" className="size-3.5" />
                  )}
                </span>
                <span
                  className={`flex-1 text-sm ${step.done || step.current ? 'font-semibold text-ink' : 'text-muted'}`}
                >
                  {step.label}
                </span>
                <span className="text-[11px] text-muted">{step.time}</span>
              </li>
            ))}
          </ol>
          <div className="mx-4 mb-4 flex flex-col gap-1.5 rounded-xl border border-line p-3 text-xs">
            <span className="flex justify-between text-body">
              <span>Veg thali × 1</span>
              <span>₹80</span>
            </span>
            <span className="flex justify-between text-body">
              <span>Extra chapati × 2</span>
              <span>₹20</span>
            </span>
            <span className="mt-1 flex justify-between border-t border-line pt-2 font-bold text-ink">
              <span>Total</span>
              <span>₹100</span>
            </span>
          </div>
          <div className="mx-4 mb-5 flex items-center gap-2 rounded-xl bg-accent-50 px-3 py-2.5 text-xs font-semibold text-accent-700">
            <Icon name="receipt" className="size-4" />
            Invoice ready when you collect
          </div>
        </div>
      </div>
      <figcaption className="sr-only">Sample order being tracked in the app.</figcaption>
    </figure>
  );
}

export function DailyServicesSection() {
  return (
    <section
      id="services"
      aria-labelledby="services-title"
      className="scroll-mt-20 border-y border-line bg-surface py-20"
    >
      <Container className="grid items-center gap-12 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-8">
          <SectionHeading
            id="services-title"
            eyebrow="Daily campus services"
            title={
              <>
                Order. Print. Book.
                <br />
                Skip the queue.
              </>
            }
            lead="Places on CampusPin can take orders and requests from students. Track every order live and get an invoice when it is done."
          />
          <ul className="grid gap-4 sm:grid-cols-2">
            {DAILY_SERVICES.map((service) => (
              <li key={service.title}>
                <Link
                  href={searchHref({ category: service.slug })}
                  className="group flex h-full gap-4 rounded-xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
                >
                  <IconChip icon={service.icon} tone={service.tone} />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-bold text-primary-800">{service.title}</span>
                    <span className="text-sm leading-relaxed text-body">{service.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.todaysMenus} className={CTA_CLASSES}>
              Today&rsquo;s menus
              <Icon name="arrowRight" className="size-4" />
            </Link>
            <Link href={ROUTES.orders} className={CTA_OUTLINE_CLASSES}>
              Track my orders
            </Link>
          </div>
        </div>
        <OrderPhone />
      </Container>
    </section>
  );
}
