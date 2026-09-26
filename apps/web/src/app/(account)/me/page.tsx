import type { Metadata } from 'next';
import { ProfileView } from '@/features/account/components/profile-view';

export const metadata: Metadata = { title: 'My profile', robots: { index: false } };

export default function ProfilePage() {
  return <ProfileView />;
}
