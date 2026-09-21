import { parseDurationSeconds } from './duration.js';

describe('parseDurationSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['24h', 86_400],
    ['30d', 2_592_000],
    [' 15m ', 900],
  ])('parses %s as %i seconds', (input, seconds) => {
    expect(parseDurationSeconds(input)).toBe(seconds);
  });

  it.each(['', '15', 'm', '1.5h', '-5m', '0m', '1h30m', '15 minutes', '15M', 'NaN'])(
    'rejects the ambiguous or invalid value %j',
    (input) => {
      expect(parseDurationSeconds(input)).toBeUndefined();
    },
  );
});
