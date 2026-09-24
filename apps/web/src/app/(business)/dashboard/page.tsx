import type { Metadata } from 'next';
import { BusinessDashboard } from '@/features/business/components/business-dashboard';
import { BusinessGate } from '@/features/business/components/business-gate';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = {
  title: 'Business dashboard',
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <BusinessGate next={ROUTES.dashboard}>
        <BusinessDashboard />
      </BusinessGate>
    </main>
  );
}
