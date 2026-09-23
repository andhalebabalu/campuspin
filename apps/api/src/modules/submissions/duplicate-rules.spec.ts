import { describe, expect, it } from 'vitest';
import {
  addressScore,
  categoryScore,
  geoScore,
  hasBlockingCandidate,
  jaroWinkler,
  normalizeName,
  phoneScore,
  rankCandidates,
  scoreCandidate,
} from './duplicate-rules.js';

describe('jaroWinkler', () => {
  // Canonical test vectors for the Jaro-Winkler algorithm.
  it('matches known values within a small tolerance', () => {
    expect(jaroWinkler('MARTHA', 'MARHTA')).toBeCloseTo(0.961, 2);
    expect(jaroWinkler('DIXON', 'DICKSONX')).toBeCloseTo(0.813, 2);
    expect(jaroWinkler('JELLYFISH', 'SMELLYFISH')).toBeCloseTo(0.896, 2);
  });

  it('is 1 for identical strings and 0 for completely different ones', () => {
    expect(jaroWinkler('sample mess', 'sample mess')).toBe(1);
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });

  it('handles empty strings without throwing', () => {
    expect(jaroWinkler('', '')).toBe(1);
    expect(jaroWinkler('abc', '')).toBe(0);
  });
});

describe('normalizeName', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeName('Sample  Mess!!')).toBe('sample');
  });

  it('drops generic category words so they do not dilute similarity', () => {
    expect(normalizeName('Sample Hostel')).toBe(normalizeName('Sample PG'));
  });

  it('folds common Indic spelling variants', () => {
    expect(normalizeName('Kumaar Bhavan')).toBe(normalizeName('Kumar Bhavan'));
    expect(normalizeName('Waman Lodge')).toBe(normalizeName('Vaman Lodge'));
  });

  it('treats two names that normalize to nothing as identical (both are pure category words)', () => {
    expect(normalizeName('Mess')).toBe(normalizeName('Hostel'));
  });
});

describe('geoScore', () => {
  it('is 1 at or under 50 m and 0 at or over 300 m', () => {
    expect(geoScore(0)).toBe(1);
    expect(geoScore(50)).toBe(1);
    expect(geoScore(300)).toBe(0);
    expect(geoScore(1000)).toBe(0);
  });

  it('falls off linearly in between', () => {
    expect(geoScore(175)).toBeCloseTo(0.5, 5);
  });
});

describe('categoryScore', () => {
  const mess = { id: 'mess', parentId: 'food' };
  const canteen = { id: 'canteen', parentId: 'food' };
  const library = { id: 'library', parentId: 'study' };

  it('scores an exact category match as 1', () => {
    expect(categoryScore(mess, mess)).toBe(1);
  });

  it('scores a shared group as 0.5', () => {
    expect(categoryScore(mess, canteen)).toBe(0.5);
  });

  it('scores different groups as 0', () => {
    expect(categoryScore(mess, library)).toBe(0);
  });
});

describe('addressScore', () => {
  it('is the overlap coefficient of the address word tokens', () => {
    expect(addressScore('Station Road, Ahilyanagar', 'Station Road, Ahilyanagar')).toBe(1);
    expect(addressScore('Station Road, Ahilyanagar', 'MG Road, Pune')).toBeLessThan(0.5);
  });

  it('is 0 when either address is missing', () => {
    expect(addressScore(undefined, 'Station Road')).toBe(0);
    expect(addressScore('Station Road', null)).toBe(0);
  });
});

describe('phoneScore', () => {
  it('matches after stripping formatting and a country code', () => {
    expect(phoneScore('+91 98765 43210', '9876543210')).toBe(1);
    expect(phoneScore('098765-43210', '9876543210')).toBe(1);
  });

  it('is 0 for different numbers or missing values', () => {
    expect(phoneScore('9876543210', '9876543211')).toBe(0);
    expect(phoneScore(undefined, '9876543210')).toBe(0);
  });
});

describe('scoreCandidate / rankCandidates / hasBlockingCandidate', () => {
  const subject = {
    name: 'Sample Mess',
    category: { id: 'mess', parentId: 'food' },
    latitude: 19.098,
    longitude: 74.75,
    address: 'Station Road, Ahilyanagar',
    phone: '+91 98765 43210',
  };

  it('scores a near-identical, nearby, same-category, same-phone place as block-level', () => {
    const candidate = {
      id: 'p1',
      name: 'Sample Mess',
      slug: 'sample-mess',
      latitude: 19.0981,
      longitude: 74.7501,
      address: 'Station Road, Ahilyanagar',
      phone: '9876543210',
      primaryCategory: { id: 'mess', parentId: 'food' },
    };
    const scored = scoreCandidate(subject, candidate);
    expect(scored.level).toBe('block');
    expect(scored.reasons).toContain('Same phone number');
  });

  it('scores an unrelated, distant place as below the suggest threshold (dropped by rankCandidates)', () => {
    const candidate = {
      id: 'p2',
      name: 'Totally Different Library',
      slug: 'totally-different-library',
      latitude: 20.5,
      longitude: 76.0,
      address: 'Some Other Road, Another City',
      phone: null,
      primaryCategory: { id: 'library', parentId: 'study' },
    };
    const ranked = rankCandidates(subject, [candidate]);
    expect(ranked).toHaveLength(0);
  });

  it('an exact phone match overrides a weak name/geo blend to at least 0.90', () => {
    const candidate = {
      id: 'p3',
      name: 'Completely Different Name',
      slug: 'completely-different-name',
      latitude: 19.2,
      longitude: 75.0,
      address: 'Elsewhere',
      phone: '9876543210',
      primaryCategory: null,
    };
    const scored = scoreCandidate(subject, candidate);
    expect(scored.score).toBeGreaterThanOrEqual(0.9);
    expect(scored.level).toBe('block');
  });

  it('ranks candidates best-first and hasBlockingCandidate reflects the top one', () => {
    const near = {
      id: 'near',
      name: 'Sample Mess',
      slug: 'sample-mess-near',
      latitude: 19.0981,
      longitude: 74.7501,
      address: 'Station Road, Ahilyanagar',
      phone: null,
      primaryCategory: { id: 'mess', parentId: 'food' },
    };
    const far = {
      id: 'far',
      name: 'Sample Mess Annexe',
      slug: 'sample-mess-annexe',
      latitude: 19.11,
      longitude: 74.76,
      address: 'Station Road, Ahilyanagar',
      phone: null,
      primaryCategory: { id: 'mess', parentId: 'food' },
    };
    const ranked = rankCandidates(subject, [far, near]);
    expect(ranked[0]?.placeId).toBe('near');
    expect(ranked[0]?.level).toBe('block');
    expect(hasBlockingCandidate(ranked)).toBe(true);
  });
});
