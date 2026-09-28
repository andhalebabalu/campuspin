import type { Metadata } from 'next';
import { ServicePlaces } from '@/features/services/components/service-places';

export const metadata: Metadata = { title: 'Services near you' };

export default async function ServiceTypePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <ServicePlaces serviceKey={key.toUpperCase()} />
    </main>
  );
}
