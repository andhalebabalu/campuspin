import type { Metadata } from 'next';
import { OrdersSection } from '@/features/business-dashboard/sections/orders';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  return <OrdersSection />;
}
