const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/**
 * Parses a compact duration such as `900s`, `15m`, `12h` or `30d` into seconds. Returns `undefined`
 * for anything else (no fractions, no combined units, no zero), so configuration typos fail loudly
 * at startup instead of becoming a token that never expires or expires instantly.
 */
export function parseDurationSeconds(value: string): number | undefined {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return undefined;
  const seconds = Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
  return seconds > 0 && Number.isSafeInteger(seconds) ? seconds : undefined;
}
