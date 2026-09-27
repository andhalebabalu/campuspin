import type { ReactNode } from 'react';

/** Community pages. Each page sets its own width: the chat uses the full screen, the rest a column. */
export default function CommunityLayout({ children }: { children: ReactNode }) {
  return <main className="flex w-full flex-1 flex-col">{children}</main>;
}
