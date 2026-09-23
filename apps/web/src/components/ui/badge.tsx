import type { ReactNode } from 'react';

export type BadgeTone = 'success' | 'neutral' | 'accent';

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-success-50 text-success-700',
  neutral: 'bg-subtle text-body',
  accent: 'bg-accent-50 text-accent-700',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Icon + text, never colour alone, per the design system's accessibility rule. */
export function VerifiedBadge() {
  return (
    <Badge tone="success">
      <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
          clipRule="evenodd"
        />
      </svg>
      Verified
    </Badge>
  );
}
