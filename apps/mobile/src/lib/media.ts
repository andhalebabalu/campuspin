import { API_ORIGIN } from './env';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;

/**
 * An image URL the phone can load. In development the API builds upload URLs from its own
 * `API_BASE_URL` (usually `http://localhost:3001`), which on a phone points at the phone itself,
 * so those are re-pointed at the API's real address.
 */
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(LOCAL_ORIGIN, API_ORIGIN);
}
