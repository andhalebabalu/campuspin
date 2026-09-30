import type { Metadata } from 'next';
import { OwnershipScreen } from '@/features/admin/components/crm-screens';

export const metadata: Metadata = { title: 'Ownership check' };

export default function Page() {
  return <OwnershipScreen />;
}
