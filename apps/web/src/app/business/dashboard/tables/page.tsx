import type { Metadata } from 'next';
import { TablesSection } from '@/features/business-dashboard/sections/operations';

export const metadata: Metadata = { title: 'Tables' };

export default function Page() {
  return <TablesSection />;
}
