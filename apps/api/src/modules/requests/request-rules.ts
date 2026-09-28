import type { RequestKind, RequestStatus } from '@platform/contracts';

/** The moves a business can make, per kind of request. Anything else is refused. */
const BUSINESS_MOVES: Readonly<
  Record<RequestKind, Partial<Record<RequestStatus, readonly RequestStatus[]>>>
> = {
  TABLE: {
    NEW: ['ACKNOWLEDGED', 'COMPLETED', 'CANCELLED'],
    ACKNOWLEDGED: ['COMPLETED', 'CANCELLED'],
  },
  GENERAL: {
    NEW: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: ['DIAGNOSING', 'ESTIMATE_AVAILABLE', 'IN_PROGRESS', 'CANCELLED'],
    DIAGNOSING: ['ESTIMATE_AVAILABLE', 'IN_PROGRESS', 'CANCELLED'],
    // Waiting for the student: the business can only withdraw.
    ESTIMATE_AVAILABLE: ['CANCELLED'],
    APPROVED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['READY', 'CANCELLED'],
    READY: ['COMPLETED'],
  },
};

export function businessMoves(kind: RequestKind, from: RequestStatus): readonly RequestStatus[] {
  return BUSINESS_MOVES[kind][from] ?? [];
}

export const businessCanMove = (
  kind: RequestKind,
  from: RequestStatus,
  to: RequestStatus,
): boolean => businessMoves(kind, from).includes(to);

/** A student may cancel until work has started (and a table request until it is done). */
export function studentCanCancel(kind: RequestKind, status: RequestStatus): boolean {
  if (kind === 'TABLE') return status === 'NEW' || status === 'ACKNOWLEDGED';
  return ['NEW', 'ACCEPTED', 'DIAGNOSING', 'ESTIMATE_AVAILABLE'].includes(status);
}

/** Only the student approves an estimate. */
export const studentCanApprove = (status: RequestStatus): boolean =>
  status === 'ESTIMATE_AVAILABLE';

/** Table requests stay "open" (and de-duplicated) until handled. */
export const isOpenTableStatus = (status: RequestStatus): boolean =>
  status === 'NEW' || status === 'ACKNOWLEDGED';
