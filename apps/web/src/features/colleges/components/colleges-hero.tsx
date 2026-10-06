import type { CollegeFacets } from '@platform/contracts';
import { Icon, type IconName } from '@/components/ui/icon';

function Stat({ icon, value, label }: { icon: IconName; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
        <Icon name={icon} className="size-5" />
      </span>
      <div>
        <p className="text-lg font-bold leading-tight text-ink">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

/**
 * A drawn campus scene (no photo of any real college), matching the placeholder drawing used on
 * college cards: a main building, two wings, trees and a flag.
 */
function CampusIllustration() {
  return (
    <svg
      viewBox="0 0 520 300"
      className="h-full w-full"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="430" cy="70" r="34" className="text-amber-600/25" fill="currentColor" />
      <path d="M30 262h460" className="text-accent-700" stroke="currentColor" strokeWidth="3" />
      <path d="M20 270h480" className="text-accent-400/40" stroke="currentColor" strokeWidth="8" />
      {/* wings */}
      {[
        [70, 150, 110],
        [340, 150, 110],
      ].map(([x, y, w]) => (
        <g key={x} className="text-primary-600" stroke="currentColor" strokeWidth="3">
          <rect
            x={x}
            y={y}
            width={w}
            height={112}
            className="text-primary-100"
            fill="currentColor"
          />
          <rect x={x} y={y} width={w} height={112} />
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={(x ?? 0) + 14 + col * 32}
                y={(y ?? 0) + 16 + row * 30}
                width="18"
                height="18"
                rx="2"
                className="text-white"
                fill="currentColor"
              />
            )),
          )}
        </g>
      ))}
      {/* main building */}
      <g className="text-primary-700" stroke="currentColor" strokeWidth="3">
        <path d="M160 118 260 72l100 46Z" className="text-primary-200" fill="currentColor" />
        <path d="M160 118 260 72l100 46" />
        <path d="M152 118h216" />
        <rect x="170" y="118" width="180" height="144" className="text-white" fill="currentColor" />
        <rect x="170" y="118" width="180" height="144" />
        <path d="M196 134v104M222 134v104M298 134v104M324 134v104" />
        <path
          d="M242 262v-50a18 18 0 0 1 36 0v50"
          className="text-primary-200"
          fill="currentColor"
        />
        <path d="M242 262v-50a18 18 0 0 1 36 0v50" />
        <path d="M160 246h200M150 254h220" />
        <path d="M260 72V38" />
        <path d="M260 38h26l-6 7 6 7h-26" className="text-accent-600" fill="currentColor" />
      </g>
      {/* trees */}
      {[40, 470, 200, 320].map((x, index) => (
        <g key={x} className="text-accent-700" stroke="currentColor" strokeWidth="3">
          <circle
            cx={x}
            cy={index < 2 ? 214 : 236}
            r={index < 2 ? 26 : 14}
            className="text-accent-400/50"
            fill="currentColor"
          />
          <path d={`M${x} ${index < 2 ? 238 : 250}v24`} />
        </g>
      ))}
    </svg>
  );
}

/** The directory header: title, real counts from `GET /colleges/facets`, and a drawn campus. */
export function CollegesHero({ facets }: { facets: CollegeFacets | null }) {
  const streams = facets?.streams.filter((s) => s.key !== 'other' && s.count > 0).length ?? 0;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-surface via-surface to-primary-50">
      <div className="grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="flex flex-col gap-4">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700">
            <Icon name="graduation" className="size-3.5" />
            Explore colleges
          </span>
          <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">
            Discover colleges in <span className="text-action">Pune &amp; Ahmednagar</span>
          </h1>
          <p className="max-w-xl text-body">
            Find colleges from the official government lists, see what they teach, and check the
            hostels, messes, libraries and buses around each one.
          </p>
          {facets && (
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface/90 p-4 shadow-xs sm:grid-cols-4">
              <Stat icon="building" value={facets.total} label="Colleges" />
              <Stat icon="book" value={streams} label="Streams" />
              <Stat icon="pin" value={facets.cities.length} label="Talukas covered" />
              <Stat icon="shield" value={facets.verified} label="Staff-verified" />
            </div>
          )}
        </div>
        <div className="relative hidden aspect-[52/30] lg:block">
          <CampusIllustration />
          <p className="absolute right-2 top-2 -rotate-6 font-serif text-xl italic text-primary-700">
            Better education,
            <br />
            brighter future
          </p>
        </div>
      </div>
    </section>
  );
}
