import type { BusinessCapability } from '@platform/contracts';
import type { IconName } from '@/components/ui/icon';
import { DASHBOARD } from './routes';

export interface DashboardModule {
  href: string;
  label: string;
  icon: IconName;
  group: 'Overview' | 'My business' | 'Operations' | 'Engagement' | 'Growth' | 'Account';
  /** Shown when the business has at least one of these; absent = every business. */
  requires?: readonly BusinessCapability[];
  /** And every one of these. */
  requiresAll?: readonly BusinessCapability[];
  exact?: boolean;
}

/**
 * The single place that decides which dashboard modules exist and what each needs. The sidebar,
 * the page gates and the overview all read it; the API enforces the same capabilities. A new
 * capability's module is one entry here.
 */
export const MODULES: readonly DashboardModule[] = [
  { href: DASHBOARD.home, label: 'Dashboard', icon: 'grid', group: 'Overview', exact: true },

  { href: DASHBOARD.profile, label: 'Business profile', icon: 'store', group: 'My business' },
  { href: DASHBOARD.publicPage, label: 'Public page', icon: 'globe', group: 'My business' },
  { href: DASHBOARD.services, label: 'Services & menu', icon: 'receipt', group: 'My business' },
  { href: DASHBOARD.photos, label: 'Photos', icon: 'image', group: 'My business' },
  { href: DASHBOARD.hours, label: 'Opening hours', icon: 'clock', group: 'My business' },
  { href: DASHBOARD.location, label: 'Location', icon: 'pin', group: 'My business' },
  { href: DASHBOARD.listings, label: 'Listings', icon: 'layers', group: 'My business' },

  {
    href: DASHBOARD.orders,
    label: 'Orders',
    icon: 'cart',
    group: 'Operations',
    requires: ['ORDER_MANAGEMENT'],
  },
  {
    href: DASHBOARD.tables,
    label: 'Tables',
    icon: 'utensils',
    group: 'Operations',
    requires: ['TABLE_ORDER'],
  },
  {
    href: DASHBOARD.payments,
    label: 'Payments',
    icon: 'card',
    group: 'Operations',
    requires: ['PAYMENT'],
    // Payments are recorded on orders; without orders there is nothing to pay yet.
    requiresAll: ['ORDER_MANAGEMENT'],
  },
  {
    href: DASHBOARD.invoices,
    label: 'Invoices',
    icon: 'file',
    group: 'Operations',
    requires: ['INVOICE'],
  },
  {
    href: DASHBOARD.bookings,
    label: 'Bookings',
    icon: 'calendar',
    group: 'Operations',
    requires: ['BOOKING', 'APPOINTMENT'],
  },
  {
    href: DASHBOARD.requests,
    label: 'Requests',
    icon: 'wrench',
    group: 'Operations',
    requires: ['SERVICE_REQUEST', 'TABLE_ORDER'],
  },
  { href: DASHBOARD.qr, label: 'QR codes', icon: 'qr', group: 'Operations' },

  {
    href: DASHBOARD.enquiries,
    label: 'Enquiries',
    icon: 'chat',
    group: 'Engagement',
    requires: ['ENQUIRY'],
  },
  { href: DASHBOARD.reviews, label: 'Reviews', icon: 'star', group: 'Engagement' },
  { href: DASHBOARD.offers, label: 'Offers', icon: 'tag', group: 'Engagement' },

  { href: DASHBOARD.analytics, label: 'Analytics', icon: 'chart', group: 'Growth' },
  { href: DASHBOARD.share, label: 'Share page', icon: 'share', group: 'Growth' },

  { href: DASHBOARD.subscription, label: 'Subscription', icon: 'card', group: 'Account' },
  { href: DASHBOARD.settings, label: 'Settings', icon: 'settings', group: 'Account' },
  { href: DASHBOARD.help, label: 'Help & support', icon: 'help', group: 'Account' },
];

export const GROUP_ORDER: readonly DashboardModule['group'][] = [
  'Overview',
  'My business',
  'Operations',
  'Engagement',
  'Growth',
  'Account',
];

export function moduleAllowed(
  module: Pick<DashboardModule, 'requires' | 'requiresAll'>,
  capabilities: readonly BusinessCapability[],
): boolean {
  return (
    (!module.requires || module.requires.some((capability) => capabilities.includes(capability))) &&
    (!module.requiresAll ||
      module.requiresAll.every((capability) => capabilities.includes(capability)))
  );
}

/** The module a dashboard path belongs to (the longest matching href). */
export function moduleOf(pathname: string): DashboardModule | undefined {
  return [...MODULES]
    .filter((module) => pathname === module.href || pathname.startsWith(`${module.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
