import type { Metadata } from 'next';
import { InvoiceSection } from '@/features/business-dashboard/sections/operations';

export const metadata: Metadata = { title: 'Invoice' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceSection key={id} invoiceId={id} />;
}
