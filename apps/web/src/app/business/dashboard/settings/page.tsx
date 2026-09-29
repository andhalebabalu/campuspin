import type { Metadata } from 'next';
import { SettingsSection } from '@/features/business-dashboard/sections/account';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return <SettingsSection />;
}
