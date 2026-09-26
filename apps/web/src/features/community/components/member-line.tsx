import type { MemberSummary } from '@platform/contracts';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
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
  const initials = member.displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
        {initials}
      </span>
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
