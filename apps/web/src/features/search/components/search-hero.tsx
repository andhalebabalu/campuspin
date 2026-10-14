import { Icon } from '@/components/ui/icon';
import { HandNote } from '@/features/landing/components/primitives';

/**
 * The Discover page's header: the title on the left, the campus photo on the right with a pin on
 * the college area being searched (or the default district when no college is chosen).
 */
export function SearchHero({ area }: { area: { name: string; city: string } | null }) {
  return (
    <section className="relative isolate overflow-hidden pb-14">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-linear-to-b from-primary-100/80 via-primary-50/60 to-canvas" />
        {/* eslint-disable-next-line @next/next/no-img-element -- static hero photo. */}
        <img
          src="/images/hero/campus.jpg"
          alt=""
          className="absolute top-0 right-0 h-full w-full object-cover object-[70%_45%] opacity-45 [mask-image:linear-gradient(to_bottom,black_55%,transparent),linear-gradient(to_right,transparent_10%,black_60%)] [mask-composite:intersect] md:w-[62%] md:opacity-75"
        />
        <div className="absolute inset-0 bg-linear-to-r from-canvas/95 via-canvas/50 to-transparent" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 pt-8 sm:px-6 md:grid-cols-[1.3fr_1fr] lg:px-8 lg:pt-10">
        <div className="flex animate-fade-up flex-col gap-3">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 ring-1 ring-primary-100">
            <Icon name="pin" className="size-3.5" />
            Explore Your Campus Area
          </span>
          <h1 className="text-4xl leading-[1.08] font-extrabold text-primary-800 sm:text-5xl">
            Find everything around
            <br />
            your <span className="text-accent-600">campus</span>
          </h1>
          <p className="max-w-lg text-base text-body sm:text-lg">
            Find rooms, PGs, messes, libraries, gyms, cafes, services and more.
          </p>
        </div>

        <div className="relative hidden min-h-40 md:block">
          <HandNote arrow="down-left" className="absolute top-0 right-[14%] text-[1.4rem]">
            Everything
            <br />
            near your college
            <br />
            in one place!
          </HandNote>
          <div className="absolute bottom-2 left-[38%] flex items-end gap-2">
            <svg viewBox="0 0 48 60" className="h-16 w-13 drop-shadow-xl" aria-hidden="true">
              <path
                d="M24 2C12 2 3 11 3 23c0 15 21 34 21 34s21-19 21-34C45 11 36 2 24 2Z"
                className="fill-primary-600"
              />
              <circle cx="24" cy="23" r="8" className="fill-white" />
            </svg>
            <span className="mb-6 flex max-w-52 flex-col rounded-xl bg-surface/95 px-3.5 py-2 text-sm shadow-lg ring-1 ring-line backdrop-blur">
              <span className="font-bold text-primary-800">College Area</span>
              <span className="line-clamp-2 text-body">
                {area ? `${area.name}, ${area.city}` : 'Ahilyanagar & Pune'}
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
