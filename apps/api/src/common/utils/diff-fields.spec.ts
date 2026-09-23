import { diffFields } from './diff-fields.js';

// Full edge-case coverage lives with its first caller (college-rules.spec.ts); this is a
// smoke test proving the shared location works the same way for a second caller.
describe('diffFields', () => {
  it('lists only the fields whose value really changes, ignoring undefined', () => {
    const current = { name: 'A', sortOrder: 1 };
    expect(diffFields(current, { name: 'B', sortOrder: undefined })).toEqual(['name']);
    expect(diffFields(current, { name: 'A' })).toEqual([]);
  });

  it('treats null as a real value, distinct from the current one', () => {
    const current = { icon: 'wifi' as string | null };
    expect(diffFields(current, { icon: null })).toEqual(['icon']);
  });
});
