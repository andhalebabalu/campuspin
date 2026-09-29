import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ServicesSection } from '@/features/business-dashboard/sections/services-section';

export const metadata: Metadata = { title: 'Services & menu' };

// Reads ?view= / ?place= on the client, so it renders inside a Suspense boundary.
export default function Page() {
  return (
    <Suspense>
      <ServicesSection />
    </Suspense>
  );
}
