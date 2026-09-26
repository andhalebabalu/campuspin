import {
  type Shopper,
  audienceWhere,
  effectiveStatus,
  inAudience,
  nextStatus,
  roundedKm,
} from './marketplace-rules.js';

const shopper: Shopper = {
  userId: 'buyer',
  collegeId: 'home',
  city: 'Ahmednagar',
  nearbyCollegeIds: ['home', 'near'],
  hidden: [],
};

const listing = (
  collegeId: string,
  visibility: 'MY_COLLEGE' | 'NEARBY_COLLEGES' | 'CITY',
  city = 'Ahmednagar',
) => ({
  sellerId: 'seller',
  collegeId,
  visibility,
  college: { city },
});

describe('inAudience', () => {
  it('always shows listings from my own college', () => {
    expect(inAudience(listing('home', 'MY_COLLEGE'), shopper)).toBe(true);
  });

  it('keeps MY_COLLEGE listings inside the seller’s college', () => {
    expect(inAudience(listing('near', 'MY_COLLEGE'), shopper)).toBe(false);
  });

  it('shows NEARBY_COLLEGES listings only within the radius', () => {
    expect(inAudience(listing('near', 'NEARBY_COLLEGES'), shopper)).toBe(true);
    expect(inAudience(listing('far', 'NEARBY_COLLEGES'), shopper)).toBe(false);
  });

  it('shows CITY listings to the whole city (any letter case) and nearby colleges', () => {
    expect(inAudience(listing('far', 'CITY', 'ahmednagar '), shopper)).toBe(true);
    expect(inAudience(listing('near', 'CITY', 'Pune'), shopper)).toBe(true);
    expect(inAudience(listing('far', 'CITY', 'Pune'), shopper)).toBe(false);
  });

  it('hides listings of blocked members', () => {
    expect(inAudience(listing('home', 'CITY'), { ...shopper, hidden: ['seller'] })).toBe(false);
  });
});

describe('audienceWhere', () => {
  it('narrows to my college, nearby colleges or the whole city', () => {
    expect(audienceWhere(shopper, 'my_college')).toEqual({ collegeId: 'home' });
    expect(audienceWhere(shopper, 'nearby')).toEqual({
      OR: [
        { collegeId: 'home' },
        {
          visibility: { in: ['NEARBY_COLLEGES', 'CITY'] },
          collegeId: { in: ['home', 'near'] },
        },
      ],
    });
    const city = audienceWhere(shopper, 'city') as { OR: unknown[] };
    expect(city.OR).toHaveLength(3);
    expect(city.OR[2]).toEqual({ visibility: 'CITY', college: { city: 'Ahmednagar' } });
  });
});

describe('effectiveStatus', () => {
  const past = new Date(Date.now() - 1000);
  const future = new Date(Date.now() + 60_000);

  it('reads an active or reserved listing past its end date as expired', () => {
    expect(effectiveStatus('ACTIVE', past)).toBe('EXPIRED');
    expect(effectiveStatus('RESERVED', past)).toBe('EXPIRED');
    expect(effectiveStatus('ACTIVE', future)).toBe('ACTIVE');
  });

  it('leaves final states alone', () => {
    expect(effectiveStatus('SOLD', past)).toBe('SOLD');
    expect(effectiveStatus('REMOVED', past)).toBe('REMOVED');
  });
});

describe('nextStatus', () => {
  it('follows the seller lifecycle', () => {
    expect(nextStatus('ACTIVE', 'reserve')).toBe('RESERVED');
    expect(nextStatus('RESERVED', 'unreserve')).toBe('ACTIVE');
    expect(nextStatus('RESERVED', 'sold')).toBe('SOLD');
    expect(nextStatus('EXPIRED', 'renew')).toBe('ACTIVE');
    expect(nextStatus('RESERVED', 'renew')).toBe('RESERVED');
  });

  it('refuses moves that make no sense', () => {
    expect(nextStatus('SOLD', 'reserve')).toBeNull();
    expect(nextStatus('SOLD', 'renew')).toBeNull();
    expect(nextStatus('HIDDEN', 'sold')).toBeNull();
    expect(nextStatus('ACTIVE', 'unreserve')).toBeNull();
  });
});

describe('roundedKm', () => {
  it('rounds to 100 m and keeps null for the same college', () => {
    expect(roundedKm(2449)).toBe(2.4);
    expect(roundedKm(null)).toBeNull();
  });
});
