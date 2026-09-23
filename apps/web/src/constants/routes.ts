/** Central route paths, so a URL never has to be retyped across links, redirects and forms. */
export const ROUTES = {
  home: '/',
  colleges: '/colleges',
  collegeDetail: (slug: string) => `/colleges/${slug}`,
  placeDetail: (slug: string) => `/places/${slug}`,
  search: '/search',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;
