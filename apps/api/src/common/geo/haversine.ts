/** Mean Earth radius in metres (IUGG). */
export const EARTH_RADIUS_METERS = 6_371_008.8;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle (straight-line) distance between two coordinates, in metres, by the Haversine
 * formula. This is the single definition of "distance" in the platform: colleges and places store
 * only coordinates, and every distance (college -> place, "near me") is calculated with this.
 * It is a straight-line distance, not a walking/road distance.
 */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}
