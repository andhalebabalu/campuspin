import type { Metadata } from 'next';
import { BusinessAnalyticsScreen } from '@/features/admin/components/crm-screens';

export const metadata: Metadata = { title: 'Business analytics' };

export default function Page() {
  return <BusinessAnalyticsScreen />;
}
