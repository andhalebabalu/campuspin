import type { Metadata } from 'next';
import { BusinessTypesScreen } from '@/features/admin/components/capability-panel';

export const metadata: Metadata = { title: 'Business types' };

export default function Page() {
  return <BusinessTypesScreen />;
}
