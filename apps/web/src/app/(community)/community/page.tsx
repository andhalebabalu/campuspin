import type { Metadata } from 'next';
import { CommunityFeed } from '@/features/community/components/community-feed';

export const metadata: Metadata = {
  title: 'Student community',
  description:
    'Questions, notes, events, jobs and lost & found from verified students of your college.',
};

export default function CommunityPage() {
  return <CommunityFeed />;
}
