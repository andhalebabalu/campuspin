'use client';

import { ApiClientError } from '@platform/api-client';
import type { MemberProfile } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { StudentBadgeChip } from '@/components/ui/student-badge';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { communityService } from '@/services/community.service';
import { safetyService } from '@/services/safety.service';
import { CommunityFeed } from './community-feed';
import { UserAvatar } from '@/components/ui/user-avatar';

/**
 * Another member's profile: display name, student badge and college, course and year only if their
 * privacy setting allows it, and their posts if they share activity. Never email or phone.
 */
export function MemberProfileView({ memberId }: { memberId: string }) {
  const { status, user } = useSession();
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [error, setError] = useState<{ message: string; missing: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (status === 'loading') return;
    const controller = new AbortController();
    communityService
      .member(memberId, controller.signal)
      .then((result) => setMember(result.data))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError({
          missing: caught instanceof ApiClientError && caught.status === 404,
          message: caught instanceof ApiClientError ? caught.message : 'Could not load profile.',
        });
      });
    return () => controller.abort();
  }, [memberId, status, reload]);

  if (error?.missing) {
    return <EmptyState title="Member not found" description="This profile is not available." />;
  }
  if (error) return <ErrorState message={error.message} onRetry={() => setReload((n) => n + 1)} />;
  if (!member) return <Skeleton className="h-64 w-full" />;

  const self = user?.id === member.id;
  async function toggleBlock() {
    if (!member) return;
    if (
      !member.blockedByMe &&
      !window.confirm(
        `Block ${member.displayName}? You will stop seeing each other's posts and messages.`,
      )
    )
      return;
    setBusy(true);
    setNotice(null);
    try {
      if (member.blockedByMe) await safetyService.unblock(member.id);
      else await safetyService.block(member.id);
      setMember({ ...member, blockedByMe: !member.blockedByMe });
    } catch (caught) {
      setNotice(caught instanceof ApiClientError ? caught.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {notice && <FormAlert message={notice} />}
      <section className="flex flex-col items-start gap-4 rounded-xl border border-line bg-surface p-5 shadow-xs sm:flex-row sm:items-center sm:p-6">
        <UserAvatar name={member.displayName} url={member.avatarUrl} className="size-16 text-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-2xl font-bold text-ink">{member.displayName}</h1>
          <StudentBadgeChip
            badge={{ verified: member.verifiedStudent, college: member.college }}
            size="md"
          />
          <p className="text-sm text-muted">
            {[member.course, member.year ? `Year ${member.year}` : null]
              .filter(Boolean)
              .join(' · ')}
            {(member.course || member.year) && ' · '}
            Member since{' '}
            {new Date(member.memberSince).toLocaleDateString('en-IN', {
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
        {self ? (
          <Link href={ROUTES.me} className="text-sm font-medium text-action hover:underline">
            Edit my profile
          </Link>
        ) : (
          status === 'authenticated' && (
            <Button
              size="sm"
              variant={member.blockedByMe ? 'secondary' : 'ghost'}
              loading={busy}
              onClick={() => void toggleBlock()}
            >
              {member.blockedByMe ? 'Unblock' : 'Block'}
            </Button>
          )
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Posts</h2>
        {member.blockedByMe ? (
          <p className="text-sm text-muted">You blocked this member. Unblock to see their posts.</p>
        ) : member.showsActivity ? (
          <CommunityFeed authorId={member.id} />
        ) : (
          <p className="text-sm text-muted">This member keeps their community activity private.</p>
        )}
      </section>
    </div>
  );
}
