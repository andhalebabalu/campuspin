import Constants from 'expo-constants';

const API_PORT = 3001;

/**
 * The API base URL, e.g. `http://192.168.1.5:3001/api/v1`.
 *
 * Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` for a deployed API or a tunnel. Without it, in
 * development the app assumes the API runs on the same computer as the Expo dev server and reuses
 * that computer's LAN address (a phone cannot reach the computer through `localhost`).
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && devHost) return `http://${devHost}:${API_PORT}/api/v1`;
  return `http://localhost:${API_PORT}/api/v1`;
}

export const env = {
  API_URL: resolveApiUrl(),
} as const;

/** `http://192.168.1.5:3001`: where the API serves uploaded images from. */
export const API_ORIGIN = env.API_URL.replace(/\/api\/v\d+$/, '');

/**
 * The public website (review QR codes point there, so anyone can scan them with a normal camera).
 * Set `EXPO_PUBLIC_SITE_URL` for production; in development it is the web app on the dev computer.
 */
function resolveSiteUrl(): string {
  const configured = process.env.EXPO_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${devHost ?? 'localhost'}:3000`;
}

export const SITE_URL = resolveSiteUrl();
