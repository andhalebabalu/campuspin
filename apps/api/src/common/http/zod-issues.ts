/** The parts of a Standard Schema issue we need (zod issues satisfy this structurally). */
export interface SchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

/**
 * Groups schema issues by field path (dot notation) so forms can attach messages to inputs.
 * Issues that belong to the whole body are filed under `_root`.
 */
export function issuesToFieldErrors(issues: readonly SchemaIssue[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key =
      issue.path
        ?.map((segment) => String(typeof segment === 'object' ? segment.key : segment))
        .join('.') || '_root';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}
