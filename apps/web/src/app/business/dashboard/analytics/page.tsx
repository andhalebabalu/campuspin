import type { Metadata } from 'next';
import { AnalyticsSection } from '@/features/business-dashboard/sections/growth';

export const metadata: Metadata = { title: 'Analytics' };

export default function Page() {
  return <AnalyticsSection />;
}
