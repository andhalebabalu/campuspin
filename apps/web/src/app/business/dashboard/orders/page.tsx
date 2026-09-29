import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrdersSection } from '@/features/business-dashboard/sections/panels';

export const metadata: Metadata = { title: 'Orders & bookings' };

// Reads ?view= / ?place= on the client, so it renders inside a Suspense boundary.
export default function Page() {
  return (
    <Suspense>
      <OrdersSection />
    </Suspense>
  );
}
