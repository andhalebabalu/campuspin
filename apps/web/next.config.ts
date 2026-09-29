import type { NextConfig } from 'next';

// Baseline security headers. A strict, nonce-based Content-Security-Policy is added during the
// security review phase, once all third-party origins (images, maps) are known.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Old and alias addresses of the account pages, so links already shared keep working.
  async redirects() {
    return [
      { source: '/dashboard', destination: '/business/dashboard', permanent: true },
      { source: '/dashboard/:path*', destination: '/business/dashboard/:path*', permanent: true },
      {
        source: '/register',
        has: [{ type: 'query', key: 'type', value: 'business' }],
        destination: '/business/register',
        permanent: false,
      },
      {
        source: '/register',
        has: [{ type: 'query', key: 'type', value: 'student' }],
        destination: '/student/register',
        permanent: false,
      },
      { source: '/student/dashboard', destination: '/home', permanent: false },
      // The spec's short addresses for the owner's own tools (reserved business slugs).
      { source: '/business/profile', destination: '/business/dashboard/profile', permanent: false },
      { source: '/business/preview', destination: '/business/dashboard/preview', permanent: false },
      { source: '/admin/dashboard', destination: '/admin', permanent: false },
    ];
  },
};

export default nextConfig;
