import type { Metadata } from 'next';
import { StudentFeed } from '@/features/feed/components/student-feed';

export const metadata: Metadata = { title: 'My feed', robots: { index: false, follow: false } };

export default function FeedPage() {
  return <StudentFeed />;
}
