import type { Metadata } from 'next';
import { RequireSession } from '@/features/account/components/require-session';
import { RequestTracking } from '@/features/requests/components/request-views';

export const metadata: Metadata = { title: 'Request', robots: { index: false, follow: false } };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <RequireSession title="Sign in to follow your request">
        <RequestTracking requestId={id} />
      </RequireSession>
    </main>
  );
}
