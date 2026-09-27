'use client';

import { useEffect } from 'react';
import { apiClient } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session-context';

const VISITOR_KEY = 'campuspin.visitorId';

/** A random id this browser keeps, so a visitor is counted once a day. Nothing personal. */
function visitorId(): string | null {
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null; // storage blocked: this visit is simply not counted
  }
}

/**
 * Reports one visit when the site opens, and again once the session is known, so a signed-in
 * visitor also counts as an active member. Renders nothing.
 */
export function VisitTracker() {
  const { status, user } = useSession();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (status === 'loading') return;
    const id = visitorId();
    if (!id) return;
    apiClient
      .post('/analytics/visit', { body: { visitorId: id, client: 'web' } })
      .catch(() => undefined);
  }, [status, userId]);

  return null;
}
