import type { Metadata } from 'next';
import { ServiceRequestForm } from '@/features/requests/components/service-request-form';

export const metadata: Metadata = {
  title: 'Send a request',
  robots: { index: false, follow: false },
};

export default async function RequestFormPage({
  params,
}: {
  params: Promise<{ placeSlug: string; key: string }>;
}) {
  const { placeSlug, key } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <ServiceRequestForm placeSlug={placeSlug} serviceKey={key.toUpperCase()} />
    </main>
  );
}
