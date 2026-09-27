import type { Metadata } from 'next';
import { MemberProfileView } from '@/features/community/components/member-profile-view';

export const metadata: Metadata = { title: 'Member', robots: { index: false, follow: false } };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <MemberProfileView memberId={id} />
    </div>
  );
}
