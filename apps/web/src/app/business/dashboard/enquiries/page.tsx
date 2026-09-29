import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EnquiriesSection } from '@/features/business-dashboard/sections/panels';

export const metadata: Metadata = { title: 'Enquiries' };

// Reads ?view= / ?place= on the client, so it renders inside a Suspense boundary.
export default function Page() {
  return (
    <Suspense>
      <EnquiriesSection />
    </Suspense>
  );
}
