import type { Metadata } from 'next';
import { SubscriptionsScreen } from '@/features/admin/components/crm-screens';

export const metadata: Metadata = { title: 'Subscriptions' };

export default function Page() {
  return <SubscriptionsScreen />;
}
