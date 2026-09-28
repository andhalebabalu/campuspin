import type { Metadata } from 'next';
import { ServicesScreen } from '@/features/admin/components/services-screen';

export const metadata: Metadata = { title: 'Services' };

export default function AdminServicesPage() {
  return <ServicesScreen />;
}
