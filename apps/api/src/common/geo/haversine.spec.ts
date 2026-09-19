import { distanceMeters } from './haversine.js';

const METERS_PER_DEGREE = (Math.PI / 180) * 6_371_008.8;

describe('distanceMeters (Haversine)', () => {
  it('is zero for the same point', () => {
    expect(
      distanceMeters(
        { latitude: 19.0952, longitude: 74.7496 },
        { latitude: 19.0952, longitude: 74.7496 },
      ),
    ).toBe(0);
  });

  it('measures one degree of longitude on the equator as ~111.2 km', () => {
    const d = distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    expect(d).toBeCloseTo(METERS_PER_DEGREE, 3);
  });

  it('measures one degree of latitude anywhere as the same ~111.2 km', () => {
    expect(
      distanceMeters({ latitude: 19, longitude: 74 }, { latitude: 20, longitude: 74 }),
    ).toBeCloseTo(METERS_PER_DEGREE, 3);
  });

  it('is symmetric', () => {
    const a = { latitude: 19.096, longitude: 74.748 };
    const b = { latitude: 19.087, longitude: 74.742 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });

  it('matches a known long distance (Mumbai to Delhi is about 1,150 km)', () => {
    const km =
      distanceMeters(
        { latitude: 19.076, longitude: 72.8777 },
        { latitude: 28.7041, longitude: 77.1025 },
      ) / 1000;
    expect(km).toBeGreaterThan(1140);
    expect(km).toBeLessThan(1165);
  });

  it('gives sensible sub-kilometre results for nearby places (0.001 degree of latitude is ~111 m)', () => {
    const d = distanceMeters(
      { latitude: 19.096, longitude: 74.748 },
      { latitude: 19.097, longitude: 74.748 },
    );
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('handles points on opposite sides of the antimeridian and the poles', () => {
    expect(
      distanceMeters({ latitude: 0, longitude: 179.5 }, { latitude: 0, longitude: -179.5 }),
    ).toBeCloseTo(METERS_PER_DEGREE, 3);
    expect(
      distanceMeters({ latitude: 90, longitude: 0 }, { latitude: -90, longitude: 0 }),
    ).toBeCloseTo(180 * METERS_PER_DEGREE, 3);
  });
});
