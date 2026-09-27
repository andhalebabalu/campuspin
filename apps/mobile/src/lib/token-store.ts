import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'campuspin.refreshToken';

let accessToken: string | null = null;

/**
 * The access token lives in memory only; the refresh token is kept in the device keychain /
 * keystore (SecureStore), so the session survives an app restart without ever sitting in plain
 * storage.
 */
export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  setAccessToken(token: string | null): void {
    accessToken = token;
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setRefreshToken(token: string | null): Promise<void> {
    try {
      if (token) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
      else await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      // Keystore unavailable: the session just won't survive a restart.
    }
  },
};
