import { BRAND } from '@/constants/brand';
import { env } from '@/lib/env';

/**
 * Who runs the service and who handles complaints, for the legal pages. Set through
 * NEXT_PUBLIC_LEGAL_* / NEXT_PUBLIC_GRIEVANCE_* (see .env.example). A value that is not set yet is
 * null, and the pages say so plainly instead of showing a made-up name or address.
 */
export const LEGAL = {
  /** The date the current versions of the legal pages took effect. Change it with the text. */
  updated: '9 October 2026',
  entity: env.NEXT_PUBLIC_LEGAL_ENTITY ?? null,
  address: env.NEXT_PUBLIC_LEGAL_ADDRESS ?? null,
  jurisdiction: env.NEXT_PUBLIC_LEGAL_JURISDICTION ?? null,
  grievance: {
    name: env.NEXT_PUBLIC_GRIEVANCE_OFFICER ?? null,
    email: env.NEXT_PUBLIC_GRIEVANCE_EMAIL ?? null,
    phone: env.NEXT_PUBLIC_GRIEVANCE_PHONE ?? null,
  },
  supportEmail: env.NEXT_PUBLIC_SUPPORT_EMAIL ?? null,
} as const;

/** "CampusPin Technologies Pvt. Ltd." when set, otherwise the brand name. */
export const OPERATOR = LEGAL.entity ?? BRAND.name;

/** Where a privacy or complaint email goes: the Grievance Officer, else support. */
export const CONTACT_EMAIL = LEGAL.grievance.email ?? LEGAL.supportEmail;
