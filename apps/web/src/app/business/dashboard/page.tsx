import { redirect } from 'next/navigation';
import { TAB_TO_SECTION } from '@/features/business-dashboard/routes';
import { Overview } from '@/features/business-dashboard/sections/overview';

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Old links (notifications still carry them): /business/dashboard?tab=orders → Orders.
  const { tab } = await searchParams;
  const section = tab ? TAB_TO_SECTION[tab] : undefined;
  if (section) redirect(section);
  return <Overview />;
}
