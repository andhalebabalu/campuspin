import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/components/admin-shell';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  robots: { index: false, follow: false },
};

/** Every /admin page: staff-only gate and sidebar. The API authorises each call regardless. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
