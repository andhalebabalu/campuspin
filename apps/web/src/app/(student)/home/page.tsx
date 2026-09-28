import type { Metadata } from 'next';
import { RequireSession } from '@/features/account/components/require-session';
import { StudentHome } from '@/features/services/components/student-home';

export const metadata: Metadata = { title: 'Home', robots: { index: false, follow: false } };

export default function StudentHomePage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <RequireSession
        title="Sign in to see your day"
        description="Your quick actions, today's mess menus and saved places live here."
      >
        <StudentHome />
      </RequireSession>
    </main>
  );
}
