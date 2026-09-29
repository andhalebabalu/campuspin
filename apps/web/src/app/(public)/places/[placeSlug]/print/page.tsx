import type { Metadata } from 'next';
import { PrintOrderForm } from '@/features/orders/components/print-order-form';

export const metadata: Metadata = {
  title: 'Print a document',
  robots: { index: false, follow: false },
};

export default async function PrintPage({ params }: { params: Promise<{ placeSlug: string }> }) {
  const { placeSlug } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <PrintOrderForm placeSlug={placeSlug} />
    </main>
  );
}
