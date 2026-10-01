import type { Metadata } from 'next';
import { PaymentsSection } from '@/features/business-dashboard/sections/operations';

export const metadata: Metadata = { title: 'Payments' };

export default function Page() {
  return <PaymentsSection />;
}
