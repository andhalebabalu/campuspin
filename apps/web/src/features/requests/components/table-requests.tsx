'use client';

import { ApiClientError } from '@platform/api-client';
import type { ServiceRequest, TableRequestType } from '@platform/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { engagementService } from '@/services/engagement.service';

const ICONS: Record<string, IconName> = {
  water: 'droplet',
  person: 'user',
  cutlery: 'utensils',
  tissue: 'sparkles',
  bill: 'receipt',
};

/**
 * "Water", "Call staff", "Request bill": one tap from the table. A request already on its way is
 * shown as such, so tapping again does not send it twice (the server also de-duplicates).
 */
export function TableRequests({
  types,
  qrToken,
  table,
}: {
  types: TableRequestType[];
  qrToken: string;
  table: string;
}) {
  const { status } = useSession();
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState<ServiceRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    try {
      const result = await engagementService.myRequests({ active: true });
      setOpen(result.data.filter((request) => request.kind === 'TABLE' && request.table === table));
    } catch {
      // The buttons still work; statuses show on the next refresh.
    }
  }, [table]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void Promise.resolve().then(refresh);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [status, refresh]);

  if (types.length === 0) return null;

  async function send(type: TableRequestType) {
    setBusy(type.id);
    let key = keys.current.get(type.id);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(type.id, key);
    }
    try {
      await engagementService.sendRequest({
        kind: 'TABLE',
        qrToken,
        requestTypeId: type.id,
        idempotencyKey: key,
      });
      keys.current.delete(type.id);
      toast.show(`${type.label}: the staff have been told`);
      await refresh();
    } catch (caught) {
      toast.show(
        caught instanceof ApiClientError ? caught.message : 'Could not send. Try again.',
        'error',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <Icon name="bell" className="size-5 text-primary-700" /> Need something at {table}?
      </p>
      {status !== 'authenticated' ? (
        <Link
          href={`${ROUTES.login}?next=${encodeURIComponent(pathname)}`}
          className="text-sm font-semibold text-primary-700"
        >
          Sign in to call the staff
        </Link>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {types.map((type) => {
            const pending = open.find((request) => request.label === type.label);
            return (
              <button
                key={type.id}
                type="button"
                disabled={busy === type.id || !!pending}
                onClick={() => void send(type)}
                className="flex min-h-14 items-center gap-2 rounded-xl border border-line px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-70"
              >
                <Icon name={ICONS[type.icon ?? ''] ?? 'bell'} className="size-5 text-primary-700" />
                <span className="flex-1">{type.label}</span>
                {pending && <Badge tone="accent">{pending.statusLabel}</Badge>}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
