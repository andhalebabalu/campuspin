'use client';

import { ApiClientError } from '@platform/api-client';
import {
  PAPER_SIZES,
  SERVICE_CONFIG_FIELDS,
  isConfigurableKind,
  type BusinessListing,
  type PlaceService,
  type ServiceConfigField,
} from '@platform/contracts';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { serviceIcon } from '@/features/services/lib/service-meta';
import { servicesService } from '@/services/services.service';
import { NotLiveNote, PlacePicker } from './place-picker';

type Config = Record<string, unknown>;

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-accent-600' : 'bg-neutral-300'
      }`}
    >
      <span
        className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  );
}

function ConfigInput({
  field,
  value,
  onChange,
}: {
  field: ServiceConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `config-${field.key}`;
  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink">{field.label}</p>
          {field.help && <p className="text-xs text-muted">{field.help}</p>}
        </div>
        <Toggle checked={value === true} onChange={onChange} label={field.label} />
      </div>
    );
  }
  if (field.type === 'paperSizes') {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">{field.label}</legend>
        <div className="flex flex-wrap gap-2">
          {PAPER_SIZES.map((size) => {
            const on = selected.includes(size);
            return (
              <button
                key={size}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(on ? selected.filter((item) => item !== size) : [...selected, size])
                }
                className={`rounded-full border px-3 py-1 text-sm ${
                  on ? 'border-accent-600 bg-accent-50 text-accent-700' : 'border-line text-body'
                }`}
              >
                {size}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }
  if (field.type === 'tags') {
    const text = Array.isArray(value) ? (value as string[]).join(', ') : '';
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {field.label}
        </label>
        <input
          id={id}
          defaultValue={text}
          onBlur={(event) =>
            onChange(
              event.target.value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
          className="h-10 rounded-md border border-control bg-surface px-3 text-sm"
        />
        {field.help && <p className="text-xs text-muted">{field.help}</p>}
      </div>
    );
  }
  // rupees / count
  const numeric = typeof value === 'number' ? String(value) : '';
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {field.label}
      </label>
      <div className="flex items-center gap-2">
        {field.type === 'rupees' && <span className="text-sm text-muted">₹</span>}
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={numeric}
          placeholder={field.optional ? 'Not offered' : '0'}
          onChange={(event) =>
            onChange(
              event.target.value === ''
                ? field.optional
                  ? null
                  : 0
                : Math.round(Number(event.target.value)),
            )
          }
          className="h-10 w-36 rounded-md border border-control bg-surface px-3 text-sm"
        />
      </div>
      {field.help && <p className="text-xs text-muted">{field.help}</p>}
    </div>
  );
}

function ServiceCard({
  placeId,
  service,
  onSaved,
}: {
  placeId: string;
  service: PlaceService;
  onSaved: (next: PlaceService) => void;
}) {
  const toast = useToast();
  const [config, setConfig] = useState<Config>(service.config);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = service.serviceType.kind;
  const fields = isConfigurableKind(kind) ? SERVICE_CONFIG_FIELDS[kind] : [];
  const dirty = JSON.stringify(config) !== JSON.stringify(service.config);

  async function save(dto: { enabled?: boolean; config?: Config }) {
    setBusy(true);
    setError(null);
    try {
      const result = await servicesService.updateOwnerService(
        placeId,
        service.serviceType.key,
        dto,
      );
      onSaved(result.data);
      setConfig(result.data.config);
      toast.show(
        dto.enabled === undefined
          ? 'Settings saved'
          : `${service.serviceType.name} ${dto.enabled ? 'switched on' : 'switched off'}`,
      );
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const fieldErrors = caught.details?.fields as Record<string, string[]> | undefined;
        setError(fieldErrors ? Object.values(fieldErrors).flat().join(' ') : caught.message);
      } else setError('Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
            <Icon name={serviceIcon(service.serviceType.icon)} className="size-5" />
          </span>
          <div>
            <p className="font-semibold text-ink">{service.serviceType.name}</p>
            {service.serviceType.description && (
              <p className="text-sm text-body">{service.serviceType.description}</p>
            )}
          </div>
        </div>
        <Toggle
          checked={service.enabled}
          disabled={busy}
          label={`${service.serviceType.name} on CampusPin`}
          onChange={(enabled) => void save({ enabled })}
        />
      </div>

      {service.disabledByAdmin && (
        <p className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
          Switched off by the CampusPin team{service.adminNote ? `: ${service.adminNote}` : '.'}{' '}
          Contact support to have it switched back on.
        </p>
      )}

      {service.enabled && fields.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          {fields.map((field) => (
            <ConfigInput
              key={field.key}
              field={field}
              value={config[field.key]}
              onChange={(value) => setConfig((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
          {error && <p className="text-sm text-danger-700">{error}</p>}
          <Button
            size="sm"
            className="self-start"
            disabled={!dirty}
            loading={busy}
            onClick={() => void save({ config })}
          >
            Save settings
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Which services a listing offers through CampusPin, each switched on or off with its settings. */
export function ServicesPanel({ listings }: { listings: BusinessListing[] }) {
  const [placeId, setPlaceId] = useState('');
  const [loaded, setLoaded] = useState<{ placeId: string; services: PlaceService[] } | null>(null);
  const services = loaded?.placeId === placeId ? loaded.services : null;
  const setServices = (update: (current: PlaceService[] | null) => PlaceService[] | null) =>
    setLoaded((current) =>
      current ? { ...current, services: update(current.services) ?? [] } : current,
    );
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!placeId) return;
    const controller = new AbortController();
    servicesService
      .ownerServices(placeId, controller.signal)
      .then((result) => {
        setLoaded({ placeId, services: result.data });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load your services.' },
        );
      });
    return () => controller.abort();
  }, [placeId, reload]);

  if (listings.length === 0) {
    return (
      <EmptyState
        title="Add a listing first"
        description="Services belong to one of your listings."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-body">
          Choose what students can do with your business through CampusPin. Only switched-on
          services appear on your page.
        </p>
        <PlacePicker listings={listings} value={placeId} onChange={setPlaceId} />
      </div>
      <NotLiveNote listing={listings.find((listing) => listing.id === placeId)} />
      {error ? (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={() => setReload((n) => n + 1)}
        />
      ) : !services ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((service) => (
            <ServiceCard
              key={`${placeId}-${service.serviceType.key}`}
              placeId={placeId}
              service={service}
              onSaved={(next) =>
                setServices(
                  (current) =>
                    current?.map((item) =>
                      item.serviceType.key === next.serviceType.key ? next : item,
                    ) ?? null,
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
