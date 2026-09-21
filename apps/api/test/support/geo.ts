import { EARTH_RADIUS_METERS } from '../../src/common/geo/haversine.js';

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * The point `meters` away from `origin` along `bearingDegrees` (0 = north, 90 = east), on the same
 * spherical Earth the API uses. Lets a test place a fixture at an exact, known distance.
 */
export function destination(
  origin: { latitude: number; longitude: number },
  bearingDegrees: number,
  meters: number,
): { latitude: number; longitude: number } {
  const angular = meters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(origin.latitude);
  const lng1 = toRadians(origin.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  // Keep longitude in [-180, 180).
  const longitude = ((toDegrees(lng2) + 540) % 360) - 180;
  return { latitude: toDegrees(lat2), longitude };
}

/** A small deterministic random generator (mulberry32), so a "random" test fails the same way every run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
