import type { AdminBusiness } from '@platform/contracts';

const TONES = {
  green: 'bg-success-50 text-success-700',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-danger-50 text-danger-700',
  grey: 'bg-subtle text-body',
} as const;

function Pill({ tone, children }: { tone: keyof typeof TONES; children: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Status and verification side by side, plus whether its page is live. */
export function BusinessStatusBadges({
  business,
}: {
  business: Pick<AdminBusiness, 'status' | 'verificationStatus' | 'isPublic'>;
}) {
  return (
    <span className="flex flex-wrap gap-1">
      {business.status === 'SUSPENDED' ? (
        <Pill tone="red">Suspended</Pill>
      ) : business.status === 'INACTIVE' ? (
        <Pill tone="grey">Closed</Pill>
      ) : business.isPublic ? (
        <Pill tone="green">Live</Pill>
      ) : (
        <Pill tone="grey">Not live</Pill>
      )}
      {business.verificationStatus === 'VERIFIED' ? (
        <Pill tone="green">Verified</Pill>
      ) : business.verificationStatus === 'REJECTED' ? (
        <Pill tone="red">Rejected</Pill>
      ) : (
        <Pill tone="amber">Pending</Pill>
      )}
    </span>
  );
}
