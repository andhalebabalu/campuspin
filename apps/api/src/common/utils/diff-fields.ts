/**
 * The names of the fields in `patch` whose value differs from `current`. Shared by every module
 * that does a partial update (colleges, categories, ...): a patch that changes nothing produces no
 * write and no audit row, which keeps repeated saves from cluttering the trail.
 */
export function diffFields<T extends object>(
  current: T,
  patch: Partial<T>,
): Array<keyof T & string> {
  return (Object.keys(patch) as Array<keyof T & string>).filter(
    (key) => patch[key] !== undefined && patch[key] !== current[key],
  );
}
