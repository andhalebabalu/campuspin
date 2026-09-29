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
  qr: `${base}/qr-codes`,
  analytics: `${base}/analytics`,
  share: `${base}/share`,
  subscription: `${base}/subscription`,
  settings: `${base}/settings`,
  help: `${base}/help`,
} as const;

/**
 * Old `?tab=` links (notifications stored in the database still carry them) to their section.
 * The operational tabs (orders, requests, bookings) share one page with its own tab.
 */
export const TAB_TO_SECTION: Readonly<Record<string, string>> = {
  orders: `${DASHBOARD.orders}?view=orders`,
  requests: `${DASHBOARD.orders}?view=requests`,
  bookings: `${DASHBOARD.orders}?view=bookings`,
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
