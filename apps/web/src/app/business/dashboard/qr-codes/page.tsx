import type { Metadata } from 'next';
import { QrSection } from '@/features/business-dashboard/sections/panels';

export const metadata: Metadata = { title: 'QR codes' };

export default function Page() {
  return <QrSection />;
}
