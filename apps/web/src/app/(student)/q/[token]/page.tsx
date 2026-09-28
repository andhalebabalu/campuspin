import type { Metadata } from 'next';
import { ScanLanding } from '@/features/requests/components/scan-landing';

export const metadata: Metadata = {
  title: 'Scan to order',
  robots: { index: false, follow: false },
};

export default async function QrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
      <ScanLanding token={token} />
    </main>
  );
}
