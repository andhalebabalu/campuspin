export interface BusinessPlanSeed {
  key: string;
  name: string;
  description: string;
  features: string[];
  isAvailable: boolean;
  isDefault: boolean;
}

/**
 * The plans. Only FREE is available; the paid plans are prepared so the dashboard and admin can show
 * them as "coming soon", with no price until one is decided and a payment gateway is connected.
 * Created once; staff edits are never overwritten.
 */
export const BUSINESS_PLANS: readonly BusinessPlanSeed[] = [
  {
    key: 'FREE',
    name: 'Free',
    description: 'Everything a business needs to be found by students.',
    features: [
      'Your own business page with a shareable link',
      'Photos, hours, services and prices',
      'Student reviews and enquiries',
      'Orders, bookings, menus and offers',
      'Page analytics: views, calls, WhatsApp, directions',
    ],
    isAvailable: true,
    isDefault: true,
  },
  {
    key: 'BUSINESS_PRO',
    name: 'Business Pro',
    description: 'Stand out to more students.',
    features: [
      'Everything in Free',
      'Featured placement in search',
      'More photos',
      'Longer analytics history',
    ],
    isAvailable: false,
    isDefault: false,
  },
  {
    key: 'BUSINESS_PREMIUM',
    name: 'Business Premium',
    description: 'For businesses with several branches.',
    features: [
      'Everything in Pro',
      'Priority placement near colleges',
      'Custom page design',
      'Priority support',
    ],
    isAvailable: false,
    isDefault: false,
  },
];
