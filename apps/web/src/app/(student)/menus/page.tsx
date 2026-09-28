import type { Metadata } from 'next';
import { TodaysMenus } from '@/features/services/components/todays-menus';

export const metadata: Metadata = {
  title: "Today's mess menus",
  description: 'What every mess near your college is serving today.',
};

export default function TodaysMenusPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <TodaysMenus />
    </main>
  );
}
