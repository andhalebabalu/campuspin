'use client';

import type { CollegeCard } from '@platform/contracts';
import { useEffect, useId, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { collegesService } from '@/services/colleges.service';

export interface PickedCollege {
  id: string;
  name: string;
  city: string;
}

/** Search-as-you-type over the college directory; calls `onPick` with the chosen college. */
export function CollegePicker({
  value,
  onPick,
  label = 'Your college',
  error,
}: {
  value: PickedCollege | null;
  onPick: (college: PickedCollege | null) => void;
  label?: string;
  error?: string;
}) {
  const inputId = useId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CollegeCard[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value || q.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      collegesService
        .list({ q: q.trim(), limit: 8 }, controller.signal)
        .then((result) => {
          setResults(result.data);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, value]);

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <div className="flex items-center justify-between gap-3 rounded-md border border-control bg-surface px-3.5 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
            <Icon name="building" className="size-4 shrink-0 text-muted" />
            <span className="truncate">
              {value.name} <span className="text-muted">· {value.city}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="text-sm font-medium text-action hover:underline"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        value={q}
        onChange={(event) => setQ(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Type your college name…"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        className={`h-11 rounded-md border bg-surface px-3.5 text-base text-ink placeholder:text-muted ${error ? 'border-danger-600' : 'border-control'}`}
      />
      {error && <p className="text-sm text-danger-700">{error}</p>}
      {open && q.trim().length >= 2 && (
        <ul
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-md"
        >
          {results.length === 0 ? (
            <li className="px-3.5 py-3 text-sm text-muted">No college matches that name.</li>
          ) : (
            results.map((college) => (
              <li key={college.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onPick({ id: college.id, name: college.name, city: college.city });
                    setOpen(false);
                    setQ('');
                  }}
                  className="flex w-full flex-col items-start px-3.5 py-2.5 text-left hover:bg-subtle"
                >
                  <span className="text-sm font-medium text-ink">{college.name}</span>
                  <span className="text-xs text-muted">{college.city}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
