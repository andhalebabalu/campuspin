import type { Metadata } from 'next';
import { AnalyticsScreen } from '@/features/admin/components/analytics-screen';

export const metadata: Metadata = { title: 'Analytics' };

export default function AdminAnalyticsPage() {
  return <AnalyticsScreen />;
}
