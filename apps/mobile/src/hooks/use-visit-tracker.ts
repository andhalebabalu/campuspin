import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { apiClient } from '@/lib/api';
import { useSession } from '@/lib/session';

const VISITOR_KEY = 'campuspin.visitorId';
/** Coming back to the app counts again only after this long (the API keeps one row a day anyway). */
const FOREGROUND_GAP_MS = 30 * 60_000;

let cachedId: string | null = null;

/** A version-4 UUID. Not for security: it only tells one phone from another in the counts. */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}
let lastSent = 0;

/** A random id this phone keeps, so it is counted once a day. Nothing personal. */
async function visitorId(): Promise<string | null> {
  if (cachedId) return cachedId;
  try {
    cachedId = await SecureStore.getItemAsync(VISITOR_KEY);
    if (!cachedId) {
      cachedId = uuid();
      await SecureStore.setItemAsync(VISITOR_KEY, cachedId);
    }
    return cachedId;
  } catch {
    return null;
  }
}

async function report(): Promise<void> {
  const id = await visitorId();
  if (!id) return;
  lastSent = Date.now();
  await apiClient.post('/analytics/visit', { body: { visitorId: id, client: 'mobile' } }).catch(() => undefined);
}

/**
 * Counts app visits for the staff analytics: when the app opens, after signing in or out, and when
 * it comes back to the foreground after a while.
 */
export function useVisitTracker(): void {
  const { status, user } = useSession();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (status !== 'loading') void report();
  }, [status, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastSent > FOREGROUND_GAP_MS) void report();
    });
    return () => subscription.remove();
  }, []);
}
