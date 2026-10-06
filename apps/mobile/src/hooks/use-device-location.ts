import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useCallback } from 'react';

export interface Point {
  lat: number;
  lng: number;
}

const KEY = ['device-location'] as const;

async function currentPoint(ask: boolean): Promise<Point | null> {
  const permission = ask
    ? await Location.requestForegroundPermissionsAsync()
    : await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') return null;
  const position =
    (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return {
    lat: Math.round(position.coords.latitude * 1e5) / 1e5,
    lng: Math.round(position.coords.longitude * 1e5) / 1e5,
  };
}

/**
 * The phone's location for "nearest first" lists. Never prompts on its own: it is read silently
 * when permission was already given, and `request()` asks (from a button the student tapped).
 */
export function useDeviceLocation() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => currentPoint(false).catch(() => null),
    staleTime: 5 * 60_000,
  });
  const request = useCallback(async () => {
    const point = await currentPoint(true).catch(() => null);
    queryClient.setQueryData(KEY, point);
    return point;
  }, [queryClient]);
  return { point: query.data ?? null, ready: !query.isPending, request };
}
