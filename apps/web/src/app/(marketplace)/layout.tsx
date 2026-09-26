import type { ReactNode } from 'react';
import { VerifiedGate } from '@/features/marketplace/components/verified-gate';

/** Marketplace and messages: verified students only (the API enforces it too). */
export default function MarketplaceLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <VerifiedGate>{children}</VerifiedGate>
    </main>
  );
}
