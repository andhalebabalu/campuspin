/** Central route paths, so a URL never has to be retyped across links, redirects and forms. */
export const ROUTES = {
  home: '/',
  colleges: '/colleges',
  collegeDetail: (slug: string) => `/colleges/${slug}`,
  placeDetail: (slug: string) => `/places/${slug}`,
  search: '/search',
  suggestPlace: '/suggest-a-place',
  login: '/login',
  register: '/register',
  /** Sign-up with the business account type preselected. */
  registerBusiness: '/register?type=business',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  dashboard: '/dashboard',
  dashboardNewListing: '/dashboard/listings/new',
} as const;
