import type { Metadata } from 'next';
import { LocationEditor } from '@/features/business-dashboard/sections/location-editor';

export const metadata: Metadata = { title: 'Location' };

export default function Page() {
  return <LocationEditor />;
}
