import type { Metadata } from 'next';
import { PlansScreen } from '@/features/admin/components/crm-screens';

export const metadata: Metadata = { title: 'Plans' };

export default function Page() {
  return <PlansScreen />;
}
