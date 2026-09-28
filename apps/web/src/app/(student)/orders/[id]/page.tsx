import type { Metadata } from 'next';
import { RequireSession } from '@/features/account/components/require-session';
import { OrderTracking } from '@/features/orders/components/order-tracking';

export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <RequireSession title="Sign in to follow your order">
        <OrderTracking orderId={id} />
      </RequireSession>
    </main>
  );
}
