import type { Metadata } from 'next';
import { RequireSession } from '@/features/account/components/require-session';
import { OrdersHubTabs } from '@/features/requests/components/orders-hub-tabs';

export const metadata: Metadata = { title: 'My orders', robots: { index: false, follow: false } };

export default function OrdersPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">My orders</h1>
      <RequireSession title="Sign in to see your orders">
        <OrdersHubTabs />
      </RequireSession>
    </main>
  );
}
