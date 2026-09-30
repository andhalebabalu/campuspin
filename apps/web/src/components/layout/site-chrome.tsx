'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Workspaces with their own sidebar and top bar: the site's navbar and footer stay out of them. */
const WORKSPACE_PREFIXES = ['/business/dashboard', '/admin'];

export function isWorkspacePath(pathname: string | null): boolean {
  return WORKSPACE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`),
  );
}

/** Renders the site chrome (navbar or footer) everywhere except inside a workspace. */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isWorkspacePath(pathname) ? null : <>{children}</>;
}
