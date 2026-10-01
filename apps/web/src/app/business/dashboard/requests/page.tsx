import type { Metadata } from 'next';
import { RequestsSection } from '@/features/business-dashboard/sections/operations';

export const metadata: Metadata = { title: 'Requests' };

export default function Page() {
  return <RequestsSection />;
}
