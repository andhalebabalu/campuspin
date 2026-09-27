import * as SecureStore from 'expo-secure-store';

/**
 * The newest message id seen per community section, only to show unread dots on this phone.
 * Losing it is harmless. Kept in SecureStore because it is the storage this app already has.
 */
const SEEN_KEY = 'campuspin.chat.seen';

export async function readSeen(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await SecureStore.getItemAsync(SEEN_KEY)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export async function writeSeen(category: string, messageId: string): Promise<void> {
  try {
    const seen = await readSeen();
    if ((seen[category] ?? '') >= messageId) return;
    await SecureStore.setItemAsync(SEEN_KEY, JSON.stringify({ ...seen, [category]: messageId }));
  } catch {
    // Storage unavailable: unread dots simply do not persist.
  }
}
