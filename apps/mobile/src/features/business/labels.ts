import type { LeadStatus, PlaceStatus } from '@platform/contracts';
import type { Tint } from '@/theme/tokens';

export const LISTING_STATUS: Record<PlaceStatus, { label: string; tint: Tint }> = {
  ACTIVE: { label: 'Live', tint: 'green' },
  PENDING: { label: 'Under review', tint: 'amber' },
  DRAFT: { label: 'Draft', tint: 'slate' },
  INACTIVE: { label: 'Hidden', tint: 'slate' },
  REJECTED: { label: 'Not approved', tint: 'rose' },
};

export const LEAD_STATUS: Record<LeadStatus, { label: string; tint: Tint }> = {
  NEW: { label: 'New', tint: 'blue' },
  SEEN: { label: 'Seen', tint: 'slate' },
  CONTACTED: { label: 'Contacted', tint: 'green' },
  CLOSED: { label: 'Closed', tint: 'slate' },
};
