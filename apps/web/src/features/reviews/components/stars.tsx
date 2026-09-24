'use client';

import { MAX_RATING } from '@platform/contracts';
import { useId } from 'react';

const STAR_PATH =
  'M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z';

const STEPS = Array.from({ length: MAX_RATING }, (_, index) => index + 1);

/** Read-only stars. The number is always given as text too: never colour or shape alone. */
export function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'size-5' : 'size-4';
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${value.toFixed(1)} out of ${MAX_RATING} stars`}
    >
      {STEPS.map((step) => {
        // Each star is filled by how much of it the value covers (0-100 %).
        const fill = Math.max(0, Math.min(1, value - (step - 1))) * 100;
        return (
          <span key={step} className={`relative ${box}`} aria-hidden="true">
            <svg viewBox="0 0 20 20" className={`absolute inset-0 ${box} text-neutral-300`}>
              <path d={STAR_PATH} fill="currentColor" />
            </svg>
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill}%` }}>
              <svg viewBox="0 0 20 20" className={`${box} text-amber-600`}>
                <path d={STAR_PATH} fill="currentColor" />
              </svg>
            </span>
          </span>
        );
      })}
    </span>
  );
}

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/**
 * A 1-5 star picker built on native radio buttons, so it works with the keyboard (arrow keys move
 * between stars) and screen readers announce "3 stars, Good" without extra ARIA plumbing.
 */
export function StarInput({
  label,
  value,
  onChange,
  error,
  optional = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  error?: string;
  optional?: boolean;
}) {
  const name = useId();
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={errorId}>
      <legend className="text-sm font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </legend>
      <div className="flex items-center gap-3">
        <div className="flex">
          {STEPS.map((step) => {
            const active = value !== null && step <= value;
            return (
              <label key={step} className="cursor-pointer p-0.5">
                <input
                  type="radio"
                  name={name}
                  value={step}
                  checked={value === step}
                  onChange={() => onChange(step)}
                  className="peer sr-only"
                />
                <span className="sr-only">
                  {step} {step === 1 ? 'star' : 'stars'}, {WORDS[step]}
                </span>
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className={`size-7 rounded-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
                    active ? 'text-amber-600' : 'text-neutral-300 hover:text-amber-600/60'
                  }`}
                >
                  <path d={STAR_PATH} fill="currentColor" />
                </svg>
              </label>
            );
          })}
        </div>
        <span className="text-sm text-muted" aria-hidden="true">
          {value ? WORDS[value] : ''}
        </span>
      </div>
      {error && (
        <p id={errorId} className="text-sm text-danger-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
