'use client';

import { ApiClientError } from '@platform/api-client';
import type { PlaceServices, PrivateDocument, ServiceRequestConfig } from '@platform/contracts';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { rupees } from '@/features/orders/lib/use-cart';
import { useSession } from '@/lib/auth/session-context';
import { engagementService } from '@/services/engagement.service';
import { ordersService } from '@/services/orders.service';
import { servicesService } from '@/services/services.service';

/**
 * Ask a business to take a job (a repair, a laundry pickup): what it is, what's wrong, a photo if
 * helpful, and when suits. The business replies with an estimate the student approves.
 */
export function ServiceRequestForm({
  placeSlug,
  serviceKey,
}: {
  placeSlug: string;
  serviceKey: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { status } = useSession();
  const [data, setData] = useState<PlaceServices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemId, setItemId] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<PrivateDocument | null>(null);
  const [preferredAt, setPreferredAt] = useState('');
  const [busy, setBusy] = useState<'photo' | 'send' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    servicesService
      .placeServices(placeSlug, controller.signal)
      .then((result) => setData(result.data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load the place.');
      });
    return () => controller.abort();
  }, [placeSlug]);

  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!data) return <Skeleton className="h-96 w-full" />;
  const service = data.services.find(
    (item) => item.key === serviceKey && item.kind === 'SERVICE_REQUEST',
  );
  if (!service) return <EmptyState title="This service isn't offered here on CampusPin" />;
  const config = service.config as ServiceRequestConfig;
  const items = (data.catalog[service.key] ?? []).flatMap((section) => section.items);

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('photo');
    setProblem(null);
    try {
      const result = await ordersService.uploadDocument(file);
      if (result.data.kind !== 'REQUEST_PHOTO') {
        setProblem('Attach a photo (JPEG, PNG or WebP).');
        return;
      }
      setPhoto(result.data);
    } catch (caught) {
      setProblem(caught instanceof ApiClientError ? caught.message : 'Upload failed.');
    } finally {
      setBusy(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!data || !service) return;
    setBusy('send');
    setProblem(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const result = await engagementService.sendRequest({
        kind: 'GENERAL',
        placeId: data.placeId,
        serviceKey: service.key,
        ...(itemId ? { itemId } : {}),
        description: description.trim(),
        ...(photo ? { imageId: photo.id } : {}),
        ...(preferredAt ? { preferredAt: new Date(preferredAt).toISOString() } : {}),
        idempotencyKey: idempotencyKey.current,
      });
      toast.show(`Request ${result.data.code} sent`);
      router.push(ROUTES.request(result.data.id));
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const fields = caught.details?.fields as Record<string, string[]> | undefined;
        setProblem(fields ? Object.values(fields).flat().join(' ') : caught.message);
        if (caught.status < 500) idempotencyKey.current = null;
      } else setProblem('Could not reach CampusPin. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-accent-700">{service.name}</p>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{data.name}</h1>
        {service.description && <p className="text-body">{service.description}</p>}
        {!config.acceptingRequests && (
          <p className="mt-2 text-sm text-amber-600">Not taking new requests right now.</p>
        )}
      </div>
      <Card className="flex flex-col gap-4 p-5">
        {items.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            What do you need?
            <select
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
              className="h-11 rounded-md border border-control bg-surface px-3 font-normal"
            >
              <option value="">Something else (describe below)</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · from {rupees(item.price)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Describe it
          <textarea
            required
            minLength={10}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. Screen cracked after a fall; touch still works."
            className="min-h-28 rounded-md border border-control px-3 py-2 font-normal"
          />
        </label>
        {config.photosAllowed && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-control px-4 text-sm font-medium text-ink hover:bg-subtle">
              <Icon name="image" className="size-4" />{' '}
              {photo ? 'Change photo' : busy === 'photo' ? 'Uploading…' : 'Add a photo (optional)'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy !== null || status !== 'authenticated'}
                onChange={(event) => void onPhoto(event)}
              />
            </label>
            {photo && (
              <span className="text-sm text-body">
                {photo.fileName} attached · private to you and {data.name}
              </span>
            )}
          </div>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          When suits you? (optional)
          <input
            type="datetime-local"
            value={preferredAt}
            onChange={(event) => setPreferredAt(event.target.value)}
            className="h-10 w-fit rounded-md border border-control px-3 font-normal"
          />
        </label>
      </Card>
      {problem && (
        <p role="alert" className="text-sm text-danger-700">
          {problem}
        </p>
      )}
      {status === 'authenticated' ? (
        <Button
          type="submit"
          className="self-start"
          loading={busy === 'send'}
          disabled={description.trim().length < 10 || !config.acceptingRequests}
        >
          Send request
        </Button>
      ) : (
        <Link
          href={`${ROUTES.login}?next=${encodeURIComponent(pathname)}`}
          className="inline-flex h-11 w-fit items-center rounded-md bg-action px-5 text-sm font-medium text-white"
        >
          Sign in to send
        </Link>
      )}
      <p className="text-xs text-muted">
        The business replies with an estimate if needed; nothing starts until you approve it.
      </p>
    </form>
  );
}
