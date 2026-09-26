import type { Metadata } from 'next';
import { PostComposer } from '@/features/community/components/post-composer';

export const metadata: Metadata = { title: 'New post', robots: { index: false, follow: false } };

export default function NewPostPage() {
  return <PostComposer />;
}
