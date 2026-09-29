import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DashboardFrame } from '@/features/business-dashboard/dashboard-frame';

export const metadata: Metadata = {
  title: { default: 'Business dashboard', template: '%s · Business' },
  robots: { index: false, follow: false },
};

/** Every /business/dashboard page: the business gate, sidebar and top bar. */
export default function BusinessDashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardFrame>{children}</DashboardFrame>;
}
