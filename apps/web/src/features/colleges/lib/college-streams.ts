import {
  COLLEGE_MANAGEMENT_LABELS,
  COLLEGE_STREAM_LABELS,
  type CollegeManagement,
  type CollegeStream,
} from '@platform/contracts';
import type { IconName } from '@/components/ui/icon';

/** How each stream looks as a badge. Icon plus text, never colour alone. */
export const STREAM_STYLE: Readonly<Record<CollegeStream, { icon: IconName; tone: string }>> = {
  engineering: { icon: 'laptop', tone: 'bg-primary-600 text-white' },
  pharmacy: { icon: 'medical', tone: 'bg-success-600 text-white' },
  'arts-science-commerce': { icon: 'book', tone: 'bg-violet-600 text-white' },
  computer: { icon: 'laptop', tone: 'bg-teal-600 text-white' },
  management: { icon: 'chart', tone: 'bg-rose-600 text-white' },
  education: { icon: 'graduation', tone: 'bg-amber-600 text-white' },
  law: { icon: 'shield', tone: 'bg-ink text-white' },
  other: { icon: 'building', tone: 'bg-neutral-500 text-white' },
};

export const streamLabel = (stream: CollegeStream): string => COLLEGE_STREAM_LABELS[stream];

export const managementLabel = (management: CollegeManagement | null): string =>
  management ? COLLEGE_MANAGEMENT_LABELS[management] : 'Not listed';
