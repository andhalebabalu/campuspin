'use client';

import { Icon } from '@/components/ui/icon';

/** 1 … 4 5 [6] 7 8 … 12: the first, the last and two either side of the current page. */
export function pageItems(page: number, totalPages: number): Array<number | 'gap'> {
  const items: Array<number | 'gap'> = [];
  for (let n = 1; n <= totalPages; n += 1) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 2) items.push(n);
    else if (items[items.length - 1] !== 'gap') items.push('gap');
  }
  return items;
}

const BOX =
  'inline-flex size-10 items-center justify-center rounded-lg text-sm font-semibold transition-colors';

/** Numbered pages with previous/next arrows. Renders nothing for a single page. */
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className={`${BOX} border border-line bg-surface text-ink hover:bg-subtle disabled:opacity-40`}
      >
        <Icon name="chevronLeft" className="size-4" label="Previous page" />
      </button>
      {pageItems(page, totalPages).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-muted" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
            className={`${BOX} ${
              item === page
                ? 'bg-primary-600 text-white shadow-md shadow-primary-600/25'
                : 'text-ink hover:bg-subtle'
            }`}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className={`${BOX} border border-line bg-surface text-ink hover:bg-subtle disabled:opacity-40`}
      >
        <Icon name="chevronRight" className="size-4" label="Next page" />
      </button>
    </nav>
  );
}
