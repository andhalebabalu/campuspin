'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';

export interface ShellItem {
  href: string;
  label: string;
  icon: IconName;
  /** A count shown next to the label (new enquiries...). Hidden when 0 or undefined. */
  badge?: number;
  /** Active only on this exact path (the section's home). */
  exact?: boolean;
}

export interface ShellGroup {
  label: string | null;
  items: ShellItem[];
}

const COLLAPSE_KEY = 'cp:sidebar-collapsed';

// The collapsed preference lives in localStorage; read through a store so the server render and
// the first client render agree (expanded), then the saved choice applies.
const listeners = new Set<() => void>();
const collapseStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get(): boolean {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  },
  set(value: boolean) {
    try {
      localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
    listeners.forEach((listener) => listener());
  },
};

function subscribeToHistory(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

/**
 * The frame of a workspace (business dashboard, admin panel): a grouped sidebar that collapses to
 * icons on desktop and slides in as a drawer on phones, a top bar, and the page.
 */
export function AppShell({
  title,
  homeHref,
  groups,
  topBar,
  account,
  children,
}: {
  /** Shown under the logo, e.g. "Business" or "Admin". */
  title: string;
  homeHref: string;
  groups: ShellGroup[];
  topBar: ReactNode;
  /** The signed-in person at the bottom of the sidebar (name, sign out). */
  account: (collapsed: boolean) => ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(collapseStore.subscribe, collapseStore.get, () => false);
  // Re-read on every render (each navigation re-renders through usePathname); '' on the server.
  const search = useSyncExternalStore(
    subscribeToHistory,
    () => window.location.search,
    () => '',
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer on navigation and with Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const isActive = (item: ShellItem) => {
    const [path = '', query] = item.href.split('?');
    if (query) {
      // An entry with a query (e.g. ?role=STUDENT) is active only when those values match.
      const current = new URLSearchParams(search);
      return (
        pathname === path &&
        [...new URLSearchParams(query)].every(([key, value]) => current.get(key) === value)
      );
    }
    const siblingWithQuery = groups.some((group) =>
      group.items.some((other) => other.href.startsWith(`${path}?`) && isActive(other)),
    );
    if (siblingWithQuery) return false;
    return item.exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  };

  const nav = (compact: boolean) => (
    <nav aria-label={title} className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((group, index) => (
        <div key={group.label ?? index} className="flex flex-col gap-0.5">
          {group.label && !compact && (
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
              {group.label}
            </p>
          )}
          {group.label && compact && <div className="mx-3 mb-1.5 border-t border-line" />}
          {group.items.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={compact ? item.label : undefined}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-body hover:bg-subtle hover:text-ink'
                } ${compact ? 'justify-center' : ''}`}
              >
                {active && (
                  <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary-600" />
                )}
                <Icon
                  name={item.icon}
                  className={`size-[18px] ${active ? 'text-primary-600' : 'text-muted group-hover:text-ink'}`}
                />
                {!compact && <span className="flex-1 truncate">{item.label}</span>}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`rounded-full bg-primary-600 text-[11px] font-semibold text-white ${compact ? 'absolute top-1 right-1 size-2 p-0 text-[0px]' : 'px-1.5 py-0.5'}`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const brand = (compact: boolean) => (
    <Link href={homeHref} className="flex items-center gap-2.5 px-5 py-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- the app icon, a static file. */}
      <img src="/icon.png" alt="" className="size-8 rounded-lg" />
      {!compact && (
        <span className="flex flex-col leading-tight">
          <span className="text-base font-bold text-ink">{BRAND.name}</span>
          <span className="text-xs font-medium text-muted">{title}</span>
        </span>
      )}
    </Link>
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Desktop sidebar */}
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex ${collapsed ? 'w-[4.5rem]' : 'w-64'}`}
      >
        <div className="flex items-center justify-between border-b border-line">
          {brand(collapsed)}
        </div>
        {nav(collapsed)}
        <div className="border-t border-line p-3">{account(collapsed)}</div>
        <button
          type="button"
          onClick={() => collapseStore.set(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute top-5 -right-3 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-xs hover:text-ink"
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} className="size-3.5" />
        </button>
      </aside>

      {/* Phone / tablet drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line pr-3">
              {brand(false)}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-ink"
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>
            {nav(false)}
            <div className="border-t border-line p-3">{account(false)}</div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="-ml-1 rounded-lg p-2 text-ink hover:bg-subtle lg:hidden"
          >
            <Icon name="menu" className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">{topBar}</div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Heading of a workspace page: title, one line of help, actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="text-sm text-body">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
