import { type Coordinates, EARTH_RADIUS_METERS } from './haversine.js';

/**
 * A rectangle in degrees. `minLongitude` / `maxLongitude` are null when the circle reaches a pole
 * or crosses the 180th meridian, where a simple longitude range no longer describes it; then only
 * the latitude band can be used to narrow a search.
 */
export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number | null;
  maxLongitude: number | null;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * The smallest latitude/longitude rectangle that contains EVERY point within `radiusMeters` of
 * `center` (great-circle distance). It lets an index on (latitude, longitude) throw away nearly all
 * places before the exact Haversine distance is computed. It is a superset: the corners can hold
 * points slightly further away, which the exact check then removes; it never misses a point that
 * is really in range.
 */
export function boundingBox(center: Coordinates, radiusMeters: number): BoundingBox {
  const angular = radiusMeters / EARTH_RADIUS_METERS;
  const latitudeSpan = toDegrees(angular);
  const minLatitude = center.latitude - latitudeSpan;
  const maxLatitude = center.latitude + latitudeSpan;

  // A circle that reaches a pole contains every longitude.
  if (minLatitude <= -90 || maxLatitude >= 90) {
    return {
      minLatitude: Math.max(-90, minLatitude),
      maxLatitude: Math.min(90, maxLatitude),
      minLongitude: null,
      maxLongitude: null,
    };
  }

  // Exact half-width of a great-circle circle in longitude: asin(sin(r/R) / cos(latitude)).
  const longitudeSpan = toDegrees(
    Math.asin(Math.sin(angular) / Math.cos(toRadians(center.latitude))),
  );
  const minLongitude = center.longitude - longitudeSpan;
  const maxLongitude = center.longitude + longitudeSpan;

  if (minLongitude < -180 || maxLongitude > 180) {
    return { minLatitude, maxLatitude, minLongitude: null, maxLongitude: null };
  }
  return { minLatitude, maxLatitude, minLongitude, maxLongitude };
}
