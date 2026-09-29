import type { Metadata } from 'next';
import { Preview } from '@/features/business-dashboard/sections/preview';

export const metadata: Metadata = { title: 'Preview' };

export default function Page() {
  return <Preview />;
}
