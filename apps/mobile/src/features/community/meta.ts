import type { CommunityCategory } from '@platform/contracts';
import type { IconName } from '@/components/ui';
import type { Tint } from '@/theme/tokens';

/** How each community section looks: icon, colour and a one-line hint. */
export const CATEGORY_META: Record<CommunityCategory, { icon: IconName; tint: Tint; hint: string }> = {
  DISCUSSION: { icon: 'chatbubbles', tint: 'blue', hint: 'Talk about anything on campus' },
  QUESTION: { icon: 'help-circle', tint: 'violet', hint: 'Ask your classmates' },
  ANNOUNCEMENT: { icon: 'megaphone', tint: 'rose', hint: 'Important updates for everyone' },
  EVENT: { icon: 'calendar', tint: 'amber', hint: 'Fests, workshops, meetups' },
  STUDY: { icon: 'book', tint: 'teal', hint: 'Notes, doubts, study groups' },
  JOB: { icon: 'briefcase', tint: 'green', hint: 'Internships and part-time work' },
  LOST_FOUND: { icon: 'search', tint: 'slate', hint: 'Lost something? Found something?' },
  STUDENT_UPDATE: { icon: 'sparkles', tint: 'blue', hint: 'Share what you are up to' },
};
