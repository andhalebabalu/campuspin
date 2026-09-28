import type { Metadata } from 'next';
import { OrderingView } from '@/features/orders/components/ordering-view';

export const metadata: Metadata = {
  title: 'Order for pickup',
  robots: { index: false, follow: false },
};

export default async function PickupOrderPage({
  params,
}: {
  params: Promise<{ placeSlug: string }>;
}) {
  const { placeSlug } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
      <OrderingView placeSlug={placeSlug} />
    </main>
  );
}
