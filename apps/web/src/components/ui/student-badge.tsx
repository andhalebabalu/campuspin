import type { StudentBadge } from '@platform/contracts';
import { Icon } from './icon';

/**
 * "Verified Student · ABC College" or "Unverified member". Icon plus text, never colour alone. Used
 * wherever a member appears (profile, community author, marketplace seller).
 */
export function StudentBadgeChip({
  badge,
  showCollege = true,
  size = 'sm',
}: {
  badge: Pick<StudentBadge, 'verified' | 'college'>;
  showCollege?: boolean;
  size?: 'sm' | 'md';
}) {
  const text = size === 'md' ? 'text-sm' : 'text-xs';
  if (!badge.verified) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1 font-medium text-body ${text}`}
      >
        <Icon name="user" className="size-3.5" />
        Unverified member
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 font-medium text-success-700 ${text}`}
    >
      <Icon name="graduation" className="size-3.5" />
      Verified Student
      {showCollege && badge.college && (
        <span className="font-normal text-success-700/80">· {badge.college.name}</span>
      )}
    </span>
  );
}
