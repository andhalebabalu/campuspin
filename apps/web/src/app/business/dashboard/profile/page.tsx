import type { Metadata } from 'next';
import { ProfileEditor } from '@/features/business-dashboard/sections/profile-editor';

export const metadata: Metadata = { title: 'Business profile' };

export default function Page() {
  return <ProfileEditor />;
}
