import type { Metadata } from 'next';
import { SubscriptionSection } from '@/features/business-dashboard/sections/account';

export const metadata: Metadata = { title: 'Subscription' };

export default function Page() {
  return <SubscriptionSection />;
}
