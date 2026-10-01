const base = '/business/dashboard';

/** Every section of the business dashboard. `/business/<slug>` is the public page, so these are static. */
export const DASHBOARD = {
  home: base,
  profile: `${base}/profile`,
  publicPage: `${base}/public-page`,
  preview: `${base}/preview`,
  services: `${base}/services`,
  photos: `${base}/photos`,
  hours: `${base}/hours`,
  location: `${base}/location`,
  listings: `${base}/listings`,
  newListing: `${base}/listings/new`,
  reviews: `${base}/reviews`,
  enquiries: `${base}/enquiries`,
  offers: `${base}/offers`,
  orders: `${base}/orders`,
  order: (id: string) => `${base}/orders/${id}`,
  tables: `${base}/tables`,
  invoices: `${base}/invoices`,
  invoice: (id: string) => `${base}/invoices/${id}`,
  payments: `${base}/payments`,
  bookings: `${base}/bookings`,
  requests: `${base}/requests`,
  qr: `${base}/qr-codes`,
  analytics: `${base}/analytics`,
  share: `${base}/share`,
  subscription: `${base}/subscription`,
  settings: `${base}/settings`,
  help: `${base}/help`,
} as const;

/**
 * Old `?tab=` links (notifications stored in the database still carry them) to their section.
 */
export const TAB_TO_SECTION: Readonly<Record<string, string>> = {
  orders: DASHBOARD.orders,
  requests: DASHBOARD.requests,
  bookings: DASHBOARD.bookings,
  menu: `${DASHBOARD.services}?view=daily`,
  food: `${DASHBOARD.services}?view=food`,
  services: DASHBOARD.services,
  offers: DASHBOARD.offers,
  qr: DASHBOARD.qr,
  listings: DASHBOARD.listings,
  enquiries: DASHBOARD.enquiries,
  reviews: DASHBOARD.reviews,
  profile: DASHBOARD.profile,
};
