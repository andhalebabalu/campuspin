import type { Metadata } from 'next';
import { RequireSession } from '@/features/account/components/require-session';
import { MyInvoice } from '@/features/invoices/my-invoice';

export const metadata: Metadata = { title: 'Invoice', robots: { index: false, follow: false } };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <RequireSession title="Sign in to see your invoice">
        <MyInvoice key={id} invoiceId={id} />
      </RequireSession>
    </main>
  );
}
