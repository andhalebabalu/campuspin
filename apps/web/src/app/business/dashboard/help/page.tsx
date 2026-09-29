import type { Metadata } from 'next';
import { HelpSection } from '@/features/business-dashboard/sections/account';

export const metadata: Metadata = { title: 'Help & support' };

export default function Page() {
  return <HelpSection />;
}
