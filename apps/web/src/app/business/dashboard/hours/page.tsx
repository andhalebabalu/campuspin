import type { Metadata } from 'next';
import { HoursEditor } from '@/features/business-dashboard/sections/hours-editor';

export const metadata: Metadata = { title: 'Opening hours' };

export default function Page() {
  return <HoursEditor />;
}
