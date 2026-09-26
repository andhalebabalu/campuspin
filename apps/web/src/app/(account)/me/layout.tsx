import type { ReactNode } from 'react';
import { AccountTabs } from '@/features/account/components/account-tabs';
import { RequireSession } from '@/features/account/components/require-session';

/** Every /me page: the member's own area, behind a session, with the same tabs. */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <AccountTabs />
      <RequireSession description="Your profile, verification and settings are for signed-in members.">
        {children}
      </RequireSession>
    </main>
  );
}
