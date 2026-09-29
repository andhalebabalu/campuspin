import type { Metadata } from 'next';
import { PublicPageSection } from '@/features/business-dashboard/sections/account';

export const metadata: Metadata = { title: 'Public page' };

export default function Page() {
  return <PublicPageSection />;
}
