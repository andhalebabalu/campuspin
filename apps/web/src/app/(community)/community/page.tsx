import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/shared/skeleton';
import { CommunityChat } from '@/features/community/components/community-chat';

export const metadata: Metadata = {
  title: 'College chats',
  description:
    'Your college’s group chats for questions, notes, events, jobs and lost & found, only for verified students.',
};

export default function CommunityPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-2 py-4 sm:px-6 sm:py-6">
      {/* The open chat lives in `?c=`, read on the client. */}
      <Suspense fallback={<Skeleton className="h-[70dvh] w-full" />}>
        <CommunityChat />
      </Suspense>
    </div>
  );
}
