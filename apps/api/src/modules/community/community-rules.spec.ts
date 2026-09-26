import { cursorPage, eventCategoryFor, mayReadPost, type Viewer } from './community-rules.js';

const post = {
  authorId: 'author',
  collegeId: 'college-a',
  visibility: 'COLLEGE_ONLY' as const,
  status: 'ACTIVE' as const,
};
const viewer = (over: Partial<Viewer> = {}): Viewer => ({
  userId: 'reader',
  collegeId: 'college-a',
  hidden: [],
  ...over,
});

describe('mayReadPost', () => {
  it('shows a college-only post to verified students of that college only', () => {
    expect(mayReadPost(post, viewer())).toBe(true);
    expect(mayReadPost(post, viewer({ collegeId: 'college-b' }))).toBe(false);
    expect(mayReadPost(post, viewer({ collegeId: null }))).toBe(false);
    expect(mayReadPost(post, { userId: null, collegeId: null, hidden: [] })).toBe(false);
  });

  it('shows a public post to anyone, signed in or not', () => {
    const open = { ...post, visibility: 'PUBLIC' as const };
    expect(mayReadPost(open, viewer({ collegeId: 'college-b' }))).toBe(true);
    expect(mayReadPost(open, { userId: null, collegeId: null, hidden: [] })).toBe(true);
  });

  it('hides posts of blocked members both ways', () => {
    expect(mayReadPost({ ...post, visibility: 'PUBLIC' }, viewer({ hidden: ['author'] }))).toBe(
      false,
    );
  });

  it('shows a hidden post only to its author, and a removed post to nobody', () => {
    const hidden = { ...post, status: 'HIDDEN' as const };
    expect(mayReadPost(hidden, viewer())).toBe(false);
    expect(mayReadPost(hidden, viewer({ userId: 'author' }))).toBe(true);
    expect(mayReadPost({ ...post, status: 'REMOVED' }, viewer({ userId: 'author' }))).toBe(false);
  });

  it('lets authors read their own post even after their verification lapsed', () => {
    expect(mayReadPost(post, viewer({ userId: 'author', collegeId: null }))).toBe(true);
  });
});

describe('eventCategoryFor', () => {
  it('maps events and jobs to their notification switches, nothing else', () => {
    expect(eventCategoryFor('EVENT')).toBe('EVENTS');
    expect(eventCategoryFor('JOB')).toBe('JOBS');
    expect(eventCategoryFor('QUESTION')).toBeNull();
  });
});

describe('cursorPage', () => {
  const rows = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];

  it('returns the last id as the cursor when there is more', () => {
    expect(cursorPage(rows, 2)).toEqual({ items: [{ id: 'c' }, { id: 'b' }], nextCursor: 'b' });
  });

  it('ends with a null cursor', () => {
    expect(cursorPage(rows, 3)).toEqual({ items: rows, nextCursor: null });
  });
});
