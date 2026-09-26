/** A search param narrowed to one of `allowed`, or '' (no filter) when it is missing or unknown. */
export function pickParam<T extends string>(
  allowed: readonly T[],
  value: string | string[] | undefined,
): T | '' {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : '';
}

export type AdminSearchParams = Promise<Record<string, string | string[] | undefined>>;
