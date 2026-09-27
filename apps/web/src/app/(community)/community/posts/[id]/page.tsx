import type { Metadata } from 'next';
import { PostDetail } from '@/features/community/components/post-detail';

export const metadata: Metadata = { title: 'Community post' };

export default async function CommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PostDetail postId={id} />
    </div>
  );
}
