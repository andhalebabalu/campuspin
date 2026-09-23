import type { ActiveStatus, AttributeDataType, CategoryOption } from '@platform/contracts';

/**
 * The category/attribute/amenity domain's business rules, as pure functions with no database and no
 * framework, so every one of them is unit-tested directly. The services only fetch data, call
 * these, and save.
 */

export type StatusPlan = { kind: 'change'; to: ActiveStatus } | { kind: 'noop' };

/**
 * `activate` -> ACTIVE, `deactivate` -> INACTIVE. Repeating either is a harmless no-op (a retried
 * request must not fail). Unlike a college, a category or amenity has no draft state to protect
 * against, so there is nothing this can refuse.
 */
export function planActiveStatusChange(
  action: 'activate' | 'deactivate',
  current: ActiveStatus,
): StatusPlan {
  const target: ActiveStatus = action === 'activate' ? 'ACTIVE' : 'INACTIVE';
  return current === target ? { kind: 'noop' } : { kind: 'change', to: target };
}

/** Data types whose values come from a fixed list, so they need `options`. */
const CHOICE_DATA_TYPES: readonly AttributeDataType[] = ['ENUM', 'MULTI_ENUM'];

export function needsOptions(dataType: AttributeDataType): boolean {
  return CHOICE_DATA_TYPES.includes(dataType);
}

export interface AttributeOptionsProblem {
  message: string;
}

/**
 * Re-validates the ENUM/MULTI_ENUM-needs-options rule against an attribute's ACTUAL data type,
 * which is what an update must do: `dataType` cannot be changed by a patch, so the patch payload
 * alone never carries it. Returns the problem to report, or undefined when the combination is fine.
 */
export function checkOptionsMatchDataType(
  dataType: AttributeDataType,
  options: readonly CategoryOption[] | null | undefined,
): AttributeOptionsProblem | undefined {
  const has = options !== undefined && options !== null && options.length > 0;
  if (needsOptions(dataType) && !has) {
    return { message: 'ENUM and MULTI_ENUM attributes need at least one option' };
  }
  if (!needsOptions(dataType) && has) {
    return { message: 'Only ENUM and MULTI_ENUM attributes take options' };
  }
  return undefined;
}
