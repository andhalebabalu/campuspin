'use client';

import { ApiClientError } from '@platform/api-client';
import type {
  BusinessCapabilities,
  BusinessCapability,
  BusinessDashboard,
  BusinessListing,
  BusinessProfile,
} from '@platform/contracts';
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
import { commerceService } from '@/services/commerce.service';

interface Workspace {
  dashboard: BusinessDashboard;
  listings: BusinessListing[];
  /** What this business can do: its type's modules. Empty while suspended. */
  capabilities: BusinessCapabilities;
  /** True when the business has at least one of these capabilities. */
  can: (...anyOf: BusinessCapability[]) => boolean;
  /** Reload the profile, numbers and listings (after an edit elsewhere). */
  refresh: () => void;
  /** Swap in a saved profile without a reload. */
  setProfile: (profile: BusinessProfile) => void;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; requestId?: string }
  | {
      status: 'ready';
      dashboard: BusinessDashboard;
      listings: BusinessListing[];
      capabilities: BusinessCapabilities;
    };

const NO_CAPABILITIES: BusinessCapabilities = {
  businessType: 'OTHER',
  typeSource: 'DEFAULT',
  capabilities: [],
  overrides: [],
};

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
      // A suspended business has no modules (its dashboard is read-only), not an error.
      commerceService.capabilities(controller.signal).then(
        (result) => result.data,
        () => NO_CAPABILITIES,
      ),
    ])
      .then(([dashboard, listings, capabilities]) =>
        setState({
          status: 'ready',
          dashboard: dashboard.data,
          listings: listings.data,
          capabilities,
        }),
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
        ? {
            dashboard: state.dashboard,
            listings: state.listings,
            capabilities: state.capabilities,
            can: (...anyOf: BusinessCapability[]) =>
              anyOf.some((capability) => state.capabilities.capabilities.includes(capability)),
            refresh,
            setProfile,
          }
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
