import type { Metadata } from 'next';
import { StudentFeed } from '@/features/feed/components/student-feed';

export const metadata: Metadata = { title: 'My feed', robots: { index: false, follow: false } };

export default function FeedPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <StudentFeed />
    </div>
  );
}
