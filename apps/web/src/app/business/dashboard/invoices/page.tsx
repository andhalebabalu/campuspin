import type { Metadata } from 'next';
import { InvoicesSection } from '@/features/business-dashboard/sections/operations';

export const metadata: Metadata = { title: 'Invoices' };

export default function Page() {
  return <InvoicesSection />;
}
