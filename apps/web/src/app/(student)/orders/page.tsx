import type { Metadata } from 'next';
import { PageHero } from '@/components/shared/page-hero';
import { RequireSession } from '@/features/account/components/require-session';
import { OrdersHubTabs } from '@/features/requests/components/orders-hub-tabs';

export const metadata: Metadata = { title: 'My orders', robots: { index: false, follow: false } };

export default function OrdersPage() {
  return (
    <main className="flex-1 pb-16">
      <PageHero
        compact
        eyebrow="Your account"
        eyebrowIcon="receipt"
        title={
          <>
            My <span className="text-accent-600">orders</span>
          </>
        }
        lead="Food, prints and requests: track them live and find your invoices."
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 sm:px-6">
        <RequireSession title="Sign in to see your orders">
          <OrdersHubTabs />
        </RequireSession>
      </div>
    </main>
  );
}
