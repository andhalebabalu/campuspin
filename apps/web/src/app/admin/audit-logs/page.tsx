import type { Metadata } from 'next';
import { AuditLogScreen } from '@/features/admin/components/crm-screens';

export const metadata: Metadata = { title: 'Audit logs' };

export default function Page() {
  return <AuditLogScreen />;
}
