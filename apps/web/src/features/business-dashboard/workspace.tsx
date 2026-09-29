'use client';

import { ApiClientError } from '@platform/api-client';
import type { BusinessDashboard, BusinessListing, BusinessProfile } from '@platform/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { businessService } from '@/services/business.service';

interface Workspace {
  dashboard: BusinessDashboard;
  listings: BusinessListing[];
  /** Reload the profile, numbers and listings (after an edit elsewhere). */
  refresh: () => void;
  /** Swap in a saved profile without a reload. */
  setProfile: (profile: BusinessProfile) => void;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; requestId?: string }
  | { status: 'ready'; dashboard: BusinessDashboard; listings: BusinessListing[] };

const WorkspaceContext = createContext<Workspace | null>(null);
const StateContext = createContext<{ state: State; retry: () => void } | null>(null);

/**
 * The signed-in owner's business, loaded once for the whole dashboard: every section reads the
 * profile and the listing list from here instead of fetching them again.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      businessService.dashboard(controller.signal),
      businessService.listings(controller.signal),
    ])
      .then(([dashboard, listings]) =>
        setState({ status: 'ready', dashboard: dashboard.data, listings: listings.data }),
      )
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState(
          caught instanceof ApiClientError
            ? { status: 'error', message: caught.message, requestId: caught.requestId }
            : { status: 'error', message: 'Could not load your business.' },
        );
      });
    return () => controller.abort();
  }, [reload]);

  const setProfile = useCallback(
    (profile: BusinessProfile) =>
      setState((current) =>
        current.status === 'ready'
          ? { ...current, dashboard: { ...current.dashboard, profile } }
          : current,
      ),
    [],
  );

  const workspace = useMemo<Workspace | null>(
    () =>
      state.status === 'ready'
        ? { dashboard: state.dashboard, listings: state.listings, refresh, setProfile }
        : null,
    [state, refresh, setProfile],
  );
  const stateValue = useMemo(() => ({ state, retry: refresh }), [state, refresh]);

  return (
    <StateContext.Provider value={stateValue}>
      <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>
    </StateContext.Provider>
  );
}

/** Inside a dashboard page (rendered only once the workspace is ready). */
export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('useWorkspace outside a loaded business dashboard');
  return workspace;
}

export function useWorkspaceState() {
  const value = useContext(StateContext);
  if (!value) throw new Error('useWorkspaceState outside WorkspaceProvider');
  return value;
}

/** The live listings first; the first one is the "main" place most sections start on. */
export function mainListing(listings: readonly BusinessListing[]): BusinessListing | undefined {
  return listings.find((listing) => listing.status === 'ACTIVE') ?? listings[0];
}
