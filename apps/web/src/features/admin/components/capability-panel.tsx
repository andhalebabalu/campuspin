'use client';

import {
  BUSINESS_CAPABILITIES,
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  CAPABILITY_INFO,
  type BusinessCapabilities,
  type BusinessCapability,
  type BusinessType,
  type BusinessTypeDefaults,
} from '@platform/contracts';
import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/lib/auth/session-context';
import { commerceService } from '@/services/commerce.service';
import { can } from '../lib/access';
import { AdminHeader, errorMessage } from './admin-ui';

type Choice = 'default' | 'on' | 'off';

/** One business: its type, and each capability as "type default", forced on or forced off. */
export function CapabilityPanel({ businessId }: { businessId: string }) {
  const toast = useToast();
  const [data, setData] = useState<BusinessCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    commerceService
      .adminCapabilities(businessId, controller.signal)
      .then((result) => {
        setData(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(caught, 'Could not load capabilities.'));
      });
    return () => controller.abort();
  }, [businessId, reload]);

  if (error) return <ErrorState message={error} onRetry={() => setReload((count) => count + 1)} />;
  if (!data) return <Skeleton className="h-80 w-full rounded-2xl" />;

  async function run(
    key: string,
    call: () => Promise<{ data: BusinessCapabilities }>,
    done: string,
  ) {
    setBusy(key);
    try {
      setData((await call()).data);
      toast.show(done);
    } catch (caught) {
      toast.show(errorMessage(caught, 'Could not save.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  const choiceOf = (capability: BusinessCapability): Choice => {
    const override = data.overrides.find((entry) => entry.capability === capability);
    return override ? (override.enabled ? 'on' : 'off') : 'default';
  };

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">Business type</h2>
          <p className="text-sm text-muted">
            {data.typeSource === 'BUSINESS'
              ? 'Set by staff for this business.'
              : data.typeSource === 'CATEGORY'
                ? 'From its category.'
                : 'Its category has no type, so it counts as Other.'}
          </p>
        </div>
        <select
          aria-label="Business type"
          value={data.typeSource === 'BUSINESS' ? data.businessType : ''}
          disabled={busy !== null}
          onChange={(event) =>
            void run(
              'type',
              () =>
                commerceService.adminSetType(
                  businessId,
                  (event.target.value || null) as BusinessType | null,
                ),
              'Business type saved',
            )
          }
          className="h-10 rounded-lg border border-control bg-surface px-3 text-sm"
        >
          <option value="">
            {data.typeSource === 'BUSINESS'
              ? 'Use its category’s type'
              : `From its category (${BUSINESS_TYPE_LABELS[data.businessType]})`}
          </option>
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {BUSINESS_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h2 className="mb-1 font-semibold text-ink">Capabilities</h2>
        <p className="mb-3 text-sm text-muted">
          Each decides a dashboard module and its API. Turning one off also switches off the
          business’s services that need it.
        </p>
        <ul className="divide-y divide-line">
          {BUSINESS_CAPABILITIES.map((capability) => {
            const active = data.capabilities.includes(capability);
            const choice = choiceOf(capability);
            return (
              <li
                key={capability}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-ink">
                    <span
                      className={`size-2 rounded-full ${active ? 'bg-success-600' : 'bg-neutral-300'}`}
                      aria-hidden="true"
                    />
                    {CAPABILITY_INFO[capability].label}
                    <span className="text-xs font-normal text-muted">{active ? 'on' : 'off'}</span>
                  </p>
                  <p className="text-xs text-muted">{CAPABILITY_INFO[capability].description}</p>
                </div>
                <div
                  role="radiogroup"
                  aria-label={CAPABILITY_INFO[capability].label}
                  className="flex shrink-0 rounded-lg bg-subtle p-0.5 text-xs font-medium"
                >
                  {(['default', 'on', 'off'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={choice === option}
                      disabled={busy !== null}
                      onClick={() =>
                        choice !== option &&
                        void run(
                          capability,
                          () =>
                            commerceService.adminSetCapability(
                              businessId,
                              capability,
                              option === 'default' ? null : option === 'on',
                            ),
                          `${CAPABILITY_INFO[capability].label}: ${option === 'default' ? 'type default' : option}`,
                        )
                      }
                      className={`rounded-md px-3 py-1.5 ${choice === option ? 'bg-surface text-ink shadow-xs' : 'text-body hover:text-ink'}`}
                    >
                      {option === 'default' ? 'Type default' : option === 'on' ? 'On' : 'Off'}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        {data.overrides.some((entry) => entry.note) && (
          <ul className="mt-2 text-xs text-muted">
            {data.overrides
              .filter((entry) => entry.note)
              .map((entry) => (
                <li key={entry.capability}>
                  {CAPABILITY_INFO[entry.capability].label}: “{entry.note}”
                </li>
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Every business type and its default capabilities; super admins can change them. */
export function BusinessTypesScreen() {
  const toast = useToast();
  const { user } = useSession();
  const editable = can(user, 'settings.manage');
  const [types, setTypes] = useState<BusinessTypeDefaults[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ type: BusinessType; caps: BusinessCapability[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    commerceService
      .businessTypes(controller.signal)
      .then((result) => setTypes(result.data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(caught, 'Could not load business types.'));
      });
    return () => controller.abort();
  }, []);

  async function save() {
    if (!draft) return;
    if (
      !window.confirm(
        `Change the modules of every ${BUSINESS_TYPE_LABELS[draft.type]} business at once?`,
      )
    )
      return;
    setBusy(true);
    try {
      setTypes((await commerceService.setTypeDefaults(draft.type, draft.caps)).data);
      setDraft(null);
      toast.show('Business type saved');
    } catch (caught) {
      toast.show(errorMessage(caught, 'Could not save.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AdminHeader
        title="Business types"
        description="What each kind of business gets by default. One business can be changed on its own page."
      />
      {error ? (
        <ErrorState message={error} />
      ) : !types ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {types.map((type) => {
            const editing = draft?.type === type.businessType;
            const caps = editing ? draft.caps : type.capabilities;
            return (
              <section
                key={type.businessType}
                className="rounded-2xl border border-line bg-surface p-5 shadow-xs"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-ink">
                      {BUSINESS_TYPE_LABELS[type.businessType]}
                    </h2>
                    <p className="text-xs text-muted">
                      {type.businessCount} business{type.businessCount === 1 ? '' : 'es'}
                    </p>
                  </div>
                  {editable && !editing && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setDraft({ type: type.businessType, caps: [...type.capabilities] })
                      }
                    >
                      Edit
                    </Button>
                  )}
                </div>
                {editing ? (
                  <>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {BUSINESS_CAPABILITIES.map((capability) => (
                        <label
                          key={capability}
                          className="flex items-center gap-2 text-sm text-ink"
                        >
                          <input
                            type="checkbox"
                            className="size-4 accent-primary-600"
                            checked={caps.includes(capability)}
                            onChange={(event) =>
                              setDraft({
                                type: type.businessType,
                                caps: event.target.checked
                                  ? [...caps, capability]
                                  : caps.filter((c) => c !== capability),
                              })
                            }
                          />
                          {CAPABILITY_INFO[capability].label}
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => void save()} loading={busy}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : caps.length === 0 ? (
                  <p className="text-sm text-muted">No modules beyond the common ones.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {caps.map((capability) => (
                      <span
                        key={capability}
                        className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700"
                      >
                        {CAPABILITY_INFO[capability].label}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {!editable && types && (
        <p className="mt-4 text-sm text-muted">Only super admins change a type’s defaults.</p>
      )}
    </div>
  );
}
