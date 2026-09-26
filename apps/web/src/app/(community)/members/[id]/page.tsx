import type { Metadata } from 'next';
import { MemberProfileView } from '@/features/community/components/member-profile-view';

export const metadata: Metadata = { title: 'Member', robots: { index: false, follow: false } };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MemberProfileView memberId={id} />;
}
