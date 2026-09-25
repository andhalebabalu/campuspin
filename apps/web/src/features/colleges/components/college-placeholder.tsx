/**
 * What a college shows when it has no photo of its own: a drawn campus building and a plain
 * "Photo not available yet" line, so nobody mistakes it for the real campus. The tint varies by
 * college (always the same for the same one) so a grid of colleges does not look identical.
 */

const TINTS = [
  { bg: 'from-primary-50 to-primary-100', stroke: 'text-primary-600', fill: 'text-primary-200' },
  { bg: 'from-accent-50 to-success-50', stroke: 'text-accent-700', fill: 'text-accent-400/40' },
  { bg: 'from-amber-50 to-rose-50', stroke: 'text-amber-600', fill: 'text-amber-600/20' },
  { bg: 'from-teal-50 to-primary-50', stroke: 'text-teal-600', fill: 'text-teal-600/20' },
] as const;

function tintFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length] ?? TINTS[0];
}

export function CollegePlaceholder({
  seed,
  size = 'md',
}: {
  /** Anything stable for the college (its slug). */
  seed: string;
  size?: 'sm' | 'md';
}) {
  const tint = tintFor(seed);
  return (
    <div
      role="img"
      aria-label="Photo not available yet"
      className={`flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br ${tint.bg}`}
    >
      <svg
        viewBox="0 0 160 110"
        className={`${size === 'sm' ? 'w-28' : 'w-44 sm:w-52'} ${tint.stroke}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* ground */}
        <path d="M6 100h148" />
        {/* flag */}
        <path d="M80 8v18" />
        <path d="M80 8h14l-3 4 3 4H80" className={tint.fill} fill="currentColor" />
        {/* roof */}
        <path d="M30 44 80 24l50 20Z" className={tint.fill} fill="currentColor" />
        <path d="M30 44 80 24l50 20" />
        <path d="M26 44h108" />
        {/* building */}
        <path d="M34 44v48h92V44" />
        <path d="M30 92h100" />
        {/* columns */}
        <path d="M46 52v32M60 52v32M100 52v32M114 52v32" />
        {/* door */}
        <path d="M72 92V68a8 8 0 0 1 16 0v24" className={tint.fill} fill="currentColor" />
        <path d="M72 92V68a8 8 0 0 1 16 0v24" />
        {/* steps */}
        <path d="M24 96h112" />
        {/* trees */}
        <circle cx="14" cy="76" r="8" className={tint.fill} fill="currentColor" />
        <path d="M14 84v16" />
        <circle cx="146" cy="76" r="8" className={tint.fill} fill="currentColor" />
        <path d="M146 84v16" />
      </svg>
      <p className={`font-medium text-body ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
        Photo not available yet
      </p>
    </div>
  );
}
