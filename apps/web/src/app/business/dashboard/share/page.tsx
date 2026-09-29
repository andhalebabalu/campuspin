import type { Metadata } from 'next';
import { ShareSection } from '@/features/business-dashboard/sections/growth';

export const metadata: Metadata = { title: 'Share page' };

export default function Page() {
  return <ShareSection />;
}
