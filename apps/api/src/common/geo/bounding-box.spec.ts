import { destination, seededRandom } from '../../../test/support/geo.js';
import { type BoundingBox, boundingBox } from './bounding-box.js';
import { distanceMeters } from './haversine.js';

const inside = (box: BoundingBox, point: { latitude: number; longitude: number }): boolean =>
  point.latitude >= box.minLatitude &&
  point.latitude <= box.maxLatitude &&
  (box.minLongitude === null ||
    box.maxLongitude === null ||
    (point.longitude >= box.minLongitude && point.longitude <= box.maxLongitude));

describe('boundingBox', () => {
  it('is centred on the point and about twice the radius tall', () => {
    const box = boundingBox({ latitude: 19.096, longitude: 74.748 }, 5000);

    expect((box.minLatitude + box.maxLatitude) / 2).toBeCloseTo(19.096, 9);
    // One degree of latitude is 111.195 km on this Earth model.
    expect(box.maxLatitude - box.minLatitude).toBeCloseTo((2 * 5000) / 111_195, 3);
    expect(((box.minLongitude ?? 0) + (box.maxLongitude ?? 0)) / 2).toBeCloseTo(74.748, 9);
  });

  it('is wider in longitude than in latitude away from the equator (meridians converge)', () => {
    const box = boundingBox({ latitude: 60, longitude: 10 }, 10_000);
    const height = box.maxLatitude - box.minLatitude;
    const width = (box.maxLongitude ?? 0) - (box.minLongitude ?? 0);
    expect(width / height).toBeCloseTo(2, 1); // 1 / cos(60 deg)
  });

  it('collapses to a point for a zero radius', () => {
    const box = boundingBox({ latitude: 19, longitude: 74 }, 0);
    expect(box.minLatitude).toBeCloseTo(box.maxLatitude, 12);
    expect(box.minLongitude).toBeCloseTo(box.maxLongitude ?? 0, 12);
  });

  it('drops the longitude range when the circle reaches a pole', () => {
    for (const latitude of [89.95, -89.95, 90, -90]) {
      const box = boundingBox({ latitude, longitude: 10 }, 50_000);
      expect(box.minLongitude).toBeNull();
      expect(box.maxLongitude).toBeNull();
      expect(box.maxLatitude).toBeLessThanOrEqual(90);
      expect(box.minLatitude).toBeGreaterThanOrEqual(-90);
    }
  });

  it('drops the longitude range when the circle crosses the 180th meridian', () => {
    for (const longitude of [179.99, -179.99, 180, -180]) {
      const box = boundingBox({ latitude: 10, longitude }, 5000);
      expect(box.minLongitude).toBeNull();
      expect(box.maxLongitude).toBeNull();
    }
  });

  it('never misses a point that is really within range (property test, 6000 random cases)', () => {
    const random = seededRandom(20260921);
    let checkedWithLongitudeRange = 0;
    for (let i = 0; i < 6000; i += 1) {
      // Mostly realistic places, with the awkward high latitudes and wide radii mixed in.
      const center = {
        latitude: i % 4 === 0 ? -85 + random() * 170 : 8 + random() * 29, // India spans about 8-37 N
        longitude: i % 4 === 0 ? -180 + random() * 360 : 68 + random() * 30,
      };
      const radius = 100 + random() * (i % 5 === 0 ? 60_000 : 8000);
      const box = boundingBox(center, radius);

      const distance = radius * random(); // a point somewhere inside the circle
      const point = destination(center, random() * 360, distance);

      // The helper itself must place the point where it says, or the test proves nothing.
      expect(distanceMeters(center, point)).toBeCloseTo(distance, 2);
      expect(inside(box, point)).toBe(true);
      if (box.minLongitude !== null) checkedWithLongitudeRange += 1;
    }
    // Guard against the test quietly passing only through the "no longitude range" escape hatch.
    expect(checkedWithLongitudeRange).toBeGreaterThan(4000);
  });

  it('also holds right on the edge of the circle (points exactly `radius` away, in every direction)', () => {
    const center = { latitude: 19.096, longitude: 74.748 };
    const box = boundingBox(center, 5000);
    for (let bearing = 0; bearing < 360; bearing += 1) {
      expect(inside(box, destination(center, bearing, 5000))).toBe(true);
    }
  });

  it('is a useful filter: at Ahilyanagar it covers under 1.3x the area of the circle', () => {
    const box = boundingBox({ latitude: 19.096, longitude: 74.748 }, 5000);
    const heightKm = (box.maxLatitude - box.minLatitude) * 111.195;
    const widthKm =
      ((box.maxLongitude ?? 0) - (box.minLongitude ?? 0)) *
      111.195 *
      Math.cos((19.096 * Math.PI) / 180);
    const circleKm2 = Math.PI * 5 * 5;
    expect((heightKm * widthKm) / circleKm2).toBeLessThan(1.3); // a square is 4/pi = 1.27x
  });
});
