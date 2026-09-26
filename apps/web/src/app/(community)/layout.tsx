import type { ReactNode } from 'react';

/** Community pages: one readable column, mobile first. */
export default function CommunityLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      {children}
    </main>
  );
}
