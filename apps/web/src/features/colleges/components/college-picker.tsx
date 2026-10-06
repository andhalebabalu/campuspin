'use client';

import type { CollegeCard } from '@platform/contracts';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '@/components/ui/icon';
import { collegesService } from '@/services/colleges.service';

/** What the picker needs to show a chosen college. */
export type PickedCollege = Pick<CollegeCard, 'slug' | 'name' | 'city'> &
  Partial<Pick<CollegeCard, 'id' | 'shortName'>>;

export interface CollegePickerProps {
  /** The chosen college, or null for "any college". */
  value: PickedCollege | null;
  onChange: (college: PickedCollege | null) => void;
  /** Shown before anything is typed (popular colleges, say). */
  suggestions?: readonly PickedCollege[];
  label: string;
  /** Visually hide the label (it stays for screen readers). */
  hideLabel?: boolean;
  placeholder?: string;
  /** Classes for the text box: callers set its height and padding to fit their form. */
  inputClassName?: string;
  className?: string;
  /** Leading icon inside the box. */
  icon?: 'pin' | 'graduation';
}

const RESULTS = 8;

/**
 * A type-to-search college chooser (an ARIA combobox). The API does the forgiving matching, so
 * "pict", "dy patil akurdi", "kothrud" or a small typo all find the college, among every college
 * on CampusPin, not just a short list.
 */
export function CollegePicker({
  value,
  onChange,
  suggestions = [],
  label,
  hideLabel = false,
  placeholder = 'Search college name or area',
  inputClassName = 'h-11 rounded-md pr-9 pl-10 text-base',
  className = '',
  icon = 'pin',
}: CollegePickerProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // The answer for one search text; anything else is still loading.
  const [found, setFound] = useState<{ q: string; colleges: readonly PickedCollege[] } | null>(
    null,
  );
  const boxRef = useRef<HTMLDivElement>(null);

  // A new value from outside (a URL change, a reset) shows its name.
  const [shownSlug, setShownSlug] = useState(value?.slug ?? null);
  if ((value?.slug ?? null) !== shownSlug) {
    setShownSlug(value?.slug ?? null);
    setText(value?.name ?? '');
  }

  const q = text.trim();
  const typing = q !== '' && text !== value?.name;
  const results = typing && found?.q === q ? found.colleges : null;
  const loading = typing && results === null;

  useEffect(() => {
    if (!typing) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      collegesService
        .list({ q, limit: RESULTS }, controller.signal)
        .then((response) => {
          setFound({ q, colleges: response.data });
          setActive(0);
        })
        .catch(() => {
          if (!controller.signal.aborted) setFound({ q, colleges: [] });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, typing]);

  // Close when focus or a click leaves the picker.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  });

  const options = typing ? (results ?? []) : suggestions.slice(0, RESULTS);

  function close() {
    setOpen(false);
    // Typed text that was never picked goes back to the current choice.
    setText(value?.name ?? '');
  }

  function choose(college: PickedCollege | null) {
    onChange(college);
    setText(college?.name ?? '');
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && options[active]) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === 'Escape') {
      close();
    }
  }

  const showList = open && (options.length > 0 || typing);

  return (
    <div ref={boxRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-ink'}>
        {label}
      </label>
      <div className="relative">
        <Icon
          name={icon}
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-primary-600"
        />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={text}
          placeholder={value ? undefined : placeholder}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`w-full border border-control bg-surface text-ink placeholder:text-muted ${inputClassName}`}
        />
        {(value || text) && (
          <button
            type="button"
            onClick={() => choose(null)}
            aria-label="Clear college"
            className="absolute top-1/2 right-2.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-ink"
          >
            <Icon name="close" className="size-4" />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          {!typing && options.length > 0 && (
            <li role="presentation" className="px-3 pt-1.5 pb-1 text-xs font-semibold text-muted">
              Popular colleges
            </li>
          )}
          {options.map((college, index) => (
            <li
              key={college.slug}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault(); // keep focus; choose on mouse down before blur
                choose(college);
              }}
              className={`flex cursor-pointer flex-col rounded-md px-3 py-2 text-left ${
                index === active ? 'bg-primary-50' : ''
              }`}
            >
              <span className="text-sm font-medium text-ink">{college.name}</span>
              <span className="text-xs text-muted">{college.city}</span>
            </li>
          ))}
          {typing && !loading && results !== null && results.length === 0 && (
            <li role="presentation" className="px-3 py-2.5 text-sm text-muted">
              No college matches “{q}”. Try its short name or area.
            </li>
          )}
          {typing && loading && results === null && (
            <li role="presentation" className="px-3 py-2.5 text-sm text-muted">
              Searching…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
