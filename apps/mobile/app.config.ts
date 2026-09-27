import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json plus the values that must not be committed. `GOOGLE_MAPS_API_KEY` is only needed for
 * Android release builds (Expo Go brings its own key); set it as an EAS secret.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    ...(process.env.GOOGLE_MAPS_API_KEY
      ? { config: { ...config.android?.config, googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } } }
      : {}),
  },
});
