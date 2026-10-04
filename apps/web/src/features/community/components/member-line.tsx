import type { MemberSummary } from '@platform/contracts';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ROUTES } from '@/constants/routes';

/** "Rahul A. 🎓 Verified Student · ABC College" — how a member appears on posts and listings. */
export function MemberLine({
  member,
  meta,
  showCollege = true,
}: {
  member: MemberSummary;
  meta?: string;
  showCollege?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <UserAvatar name={member.displayName} url={member.avatarUrl} />
      <div className="min-w-0 text-sm leading-tight">
        <Link href={ROUTES.member(member.id)} className="font-semibold text-ink hover:underline">
          {member.displayName}
        </Link>
        {member.verifiedStudent && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-success-700">
            <Icon name="graduation" className="size-3.5" />
            Verified Student
          </span>
        )}
        <p className="truncate text-xs text-muted">
          {[showCollege ? member.college?.name : null, meta].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}
