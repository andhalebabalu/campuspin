import {
  checkOptionsMatchDataType,
  needsOptions,
  planActiveStatusChange,
} from './category-rules.js';

describe('planActiveStatusChange', () => {
  it.each([
    ['activate', 'INACTIVE', { kind: 'change', to: 'ACTIVE' }],
    ['activate', 'ACTIVE', { kind: 'noop' }],
    ['deactivate', 'ACTIVE', { kind: 'change', to: 'INACTIVE' }],
    ['deactivate', 'INACTIVE', { kind: 'noop' }],
  ] as const)('%s a %s row -> %j', (action, current, expected) => {
    expect(planActiveStatusChange(action, current)).toEqual(expected);
  });

  it('is idempotent: applying a change and repeating it ends in a no-op', () => {
    for (const action of ['activate', 'deactivate'] as const) {
      const first = planActiveStatusChange(action, 'ACTIVE');
      const settled = first.kind === 'change' ? first.to : 'ACTIVE';
      const again = planActiveStatusChange(action, settled);
      expect(again.kind).toBe('noop');
    }
  });
});

describe('needsOptions', () => {
  it.each([
    ['BOOLEAN', false],
    ['INTEGER', false],
    ['DECIMAL', false],
    ['TEXT', false],
    ['DATE', false],
    ['ENUM', true],
    ['MULTI_ENUM', true],
  ] as const)('%s needs options: %s', (dataType, expected) => {
    expect(needsOptions(dataType)).toBe(expected);
  });
});

describe('checkOptionsMatchDataType', () => {
  const option = { value: 'veg', label: 'Veg' };

  it('is undefined (fine) for a matching combination', () => {
    expect(checkOptionsMatchDataType('ENUM', [option])).toBeUndefined();
    expect(checkOptionsMatchDataType('MULTI_ENUM', [option, option])).toBeUndefined();
    expect(checkOptionsMatchDataType('INTEGER', undefined)).toBeUndefined();
    expect(checkOptionsMatchDataType('TEXT', null)).toBeUndefined();
    expect(checkOptionsMatchDataType('BOOLEAN', [])).toBeUndefined();
  });

  it('reports a problem when a choice type has no options', () => {
    expect(checkOptionsMatchDataType('ENUM', undefined)?.message).toMatch(
      /need at least one option/,
    );
    expect(checkOptionsMatchDataType('MULTI_ENUM', null)?.message).toMatch(
      /need at least one option/,
    );
    expect(checkOptionsMatchDataType('ENUM', [])?.message).toMatch(/need at least one option/);
  });

  it('reports a problem when a non-choice type has options', () => {
    expect(checkOptionsMatchDataType('INTEGER', [option])?.message).toMatch(
      /Only ENUM and MULTI_ENUM/,
    );
    expect(checkOptionsMatchDataType('BOOLEAN', [option])?.message).toMatch(
      /Only ENUM and MULTI_ENUM/,
    );
  });
});
