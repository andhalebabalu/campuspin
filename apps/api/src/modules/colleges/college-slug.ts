import { RESERVED_COLLEGE_SLUGS } from '@platform/contracts';
import { slugRoot as sharedSlugRoot } from '../../common/utils/slug.js';

export { pickFreeSlug, randomizedSlug, slugify } from '../../common/utils/slug.js';

/** College-specific defaults over the shared slug builder: college reserved words, fallback "college". */
export function slugRoot(name: string): string {
  return sharedSlugRoot(name, { reservedWords: RESERVED_COLLEGE_SLUGS, fallback: 'college' });
}
