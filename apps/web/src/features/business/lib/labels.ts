import type { LeadStatus, PlaceStatus } from '@platform/contracts';
import type { BadgeTone } from '@/components/ui/badge';

export const LISTING_STATUS: Record<PlaceStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Live', tone: 'success' },
  PENDING: { label: 'Under review', tone: 'accent' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  INACTIVE: { label: 'Hidden', tone: 'neutral' },
  REJECTED: { label: 'Not approved', tone: 'danger' },
};

export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: BadgeTone }> = {
  NEW: { label: 'New', tone: 'accent' },
  SEEN: { label: 'Seen', tone: 'neutral' },
  CONTACTED: { label: 'Contacted', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

export const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });
export const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
