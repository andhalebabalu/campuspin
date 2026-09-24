import { env } from '@/lib/env';

/** The one place the brand lives, so a rename touches a single file. */
export const BRAND = {
  name: env.NEXT_PUBLIC_BRAND_NAME,
  tagline: 'Discover. Connect. Experience.',
  description:
    'Discover rooms, PGs, messes, libraries, gyms, services and more, all around your college.',
} as const;
