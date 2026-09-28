'use client';

import { useCallback, useEffect, useState } from 'react';

export interface LatLng {
  lat: number;
  lng: number;
}

type LocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

const STORAGE_KEY = 'campuspin.lastLocation';

function readStored(): LatLng | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LatLng>;
    return typeof value.lat === 'number' && typeof value.lng === 'number'
      ? { lat: value.lat, lng: value.lng }
      : null;
  } catch {
    return null;
  }
}

/**
 * The browser's location, only after the member allows it: asked on `request()`, or reused silently
 * when permission was already granted. Kept for the tab's session so pages do not ask again.
 */
export function useLocation(): {
  point: LatLng | null;
  status: LocationStatus;
  request: () => void;
} {
  const [point, setPoint] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: Math.round(position.coords.latitude * 1e5) / 1e5,
          lng: Math.round(position.coords.longitude * 1e5) / 1e5,
        };
        try {
          window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Storage can be unavailable (private mode); the location still works for this page.
        }
        setPoint(next);
        setStatus('ready');
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { maximumAge: 5 * 60_000, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(readStored()).then(async (stored) => {
      if (cancelled) return;
      if (stored) {
        setPoint(stored);
        setStatus('ready');
        return;
      }
      // Only reuse a permission already given; never prompt on page load.
      const permission = await navigator.permissions
        ?.query({ name: 'geolocation' })
        .catch(() => null);
      if (!cancelled && permission?.state === 'granted') request();
    });
    return () => {
      cancelled = true;
    };
  }, [request]);

  return { point, status, request };
}
