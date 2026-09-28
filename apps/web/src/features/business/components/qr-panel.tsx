'use client';

import { ApiClientError } from '@platform/api-client';
import type { BusinessListing, OwnerQrCode, PlaceTable } from '@platform/contracts';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ordersService } from '@/services/orders.service';
import { downloadDataUrl, printCards, renderQrCard } from '../lib/qr-card';
import { NotLiveNote, PlacePicker } from './place-picker';

interface Loaded {
  placeId: string;
  tables: PlaceTable[];
  codes: OwnerQrCode[];
}

const fileSafe = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Business QR management: one code for the place (menu, services, offers) and one per table (orders
 * come with the table number). Print, download, replace a damaged print, or switch a code off.
 */
export function QrPanel({ listings }: { listings: BusinessListing[] }) {
  const toast = useToast();
  const [placeId, setPlaceId] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null);
  const [reload, setReload] = useState(0);
  const data = loaded?.placeId === placeId ? loaded : null;
  const listing = listings.find((item) => item.id === placeId);

  useEffect(() => {
    if (!placeId) return;
    const controller = new AbortController();
    Promise.all([
      ordersService.tables(placeId, controller.signal),
      ordersService.qrCodes(placeId, controller.signal),
    ])
      .then(([tables, codes]) => {
        setLoaded({ placeId, tables: tables.data, codes: codes.data });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load your QR codes.' },
        );
      });
    return () => controller.abort();
  }, [placeId, reload]);

  const refresh = useCallback(() => setReload((count) => count + 1), []);

  async function run<T>(
    key: string,
    action: () => Promise<T>,
    success?: string,
  ): Promise<T | undefined> {
    setBusy(key);
    try {
      const result = await action();
      if (success) toast.show(success);
      return result;
    } catch (caught) {
      toast.show(
        caught instanceof ApiClientError ? caught.message : 'Something went wrong.',
        'error',
      );
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const card = (code: OwnerQrCode) =>
    renderQrCard({
      token: code.token,
      placeName: listing?.name ?? '',
      table: code.table?.label ?? null,
    });

  async function show(code: OwnerQrCode) {
    const src = await run(`view-${code.id}`, () => card(code));
    if (src) setPreview({ src, name: code.table?.label ?? listing?.name ?? 'CampusPin' });
  }

  async function ensureCode(kind: 'BUSINESS' | 'TABLE', tableId?: string) {
    const created = await run(
      `create-${tableId ?? 'business'}`,
      () =>
        ordersService.createQr(
          placeId,
          kind === 'TABLE' && tableId ? { kind, tableId } : { kind: 'BUSINESS' },
        ),
      'QR code ready',
    );
    if (created) refresh();
    return created?.data;
  }

  async function printAllTables() {
    if (!data) return;
    const cards = await run('print-all', async () => {
      const codes: OwnerQrCode[] = [];
      for (const table of data.tables.filter((item) => item.active)) {
        const existing = data.codes.find(
          (code) => code.table?.id === table.id && code.status === 'ACTIVE',
        );
        codes.push(
          existing ??
            (await ordersService.createQr(placeId, { kind: 'TABLE', tableId: table.id })).data,
        );
      }
      return Promise.all(codes.map(card));
    });
    if (cards?.length) {
      try {
        printCards(cards, `${listing?.name ?? 'CampusPin'} table codes`);
      } catch (caught) {
        toast.show(caught instanceof Error ? caught.message : 'Could not print.', 'error');
      }
      refresh();
    }
  }

  if (listings.length === 0)
    return (
      <EmptyState
        title="Add a listing first"
        description="QR codes belong to one of your listings."
      />
    );

  const businessCode = data?.codes.find((code) => code.kind === 'BUSINESS');

  const codeActions = (code: OwnerQrCode) => {
    return (
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          loading={busy === `view-${code.id}`}
          onClick={() => void show(code)}
        >
          View & print
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={busy === `regen-${code.id}`}
          onClick={() => {
            if (!window.confirm('Make a new code? The old print stops working at once.')) return;
            void run(
              `regen-${code.id}`,
              () => ordersService.regenerateQr(code.id),
              'New code made: print it',
            ).then(refresh);
          }}
        >
          Replace
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={busy === `toggle-${code.id}`}
          onClick={() =>
            void run(
              `toggle-${code.id}`,
              () => ordersService.setQrEnabled(code.id, code.status !== 'ACTIVE'),
              code.status === 'ACTIVE' ? 'Code switched off' : 'Code switched on',
            ).then(refresh)
          }
        >
          {code.status === 'ACTIVE' ? 'Switch off' : 'Switch on'}
        </Button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-body">
          Students scan a CampusPin code to open your menu and services. Table codes send the table
          number with every order. Codes carry a random token only, never your account details.
        </p>
        <PlacePicker listings={listings} value={placeId} onChange={setPlaceId} />
      </div>
      <NotLiveNote listing={listing} />

      {error ? (
        <ErrorState message={error.message} requestId={error.requestId} onRetry={refresh} />
      ) : !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <Icon name="qr" className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-ink">Business QR</p>
                <p className="text-sm text-body">
                  For the counter or entrance: opens your menu, services and offers.
                  {businessCode ? ` Scanned ${businessCode.scanCount} times.` : ''}
                </p>
              </div>
            </div>
            {businessCode ? (
              <div className="flex flex-col items-end gap-2">
                {businessCode.status !== 'ACTIVE' && <Badge tone="danger">Switched off</Badge>}
                {codeActions(businessCode)}
              </div>
            ) : (
              <Button
                loading={busy === 'create-business'}
                onClick={() => void ensureCode('BUSINESS')}
              >
                Generate QR
              </Button>
            )}
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">Tables</p>
                <p className="text-sm text-body">{data.tables.length} tables</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === 'add'}
                  onClick={() => {
                    const answer = window.prompt('How many tables to add?', '5');
                    const count = Math.round(Number(answer));
                    if (!answer || !(count >= 1 && count <= 50)) return;
                    void run(
                      'add',
                      () => ordersService.addTables(placeId, { count }),
                      `${count} tables added`,
                    ).then(refresh);
                  }}
                >
                  <Icon name="plus" className="size-4" /> Add tables
                </Button>
                {data.tables.length > 0 && (
                  <Button
                    size="sm"
                    loading={busy === 'print-all'}
                    onClick={() => void printAllTables()}
                  >
                    <Icon name="printer" className="size-4" /> Print all table codes
                  </Button>
                )}
              </div>
            </div>
            {data.tables.length === 0 ? (
              <p className="text-sm text-muted">Add your tables to give each its own QR code.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.tables.map((table) => {
                  const code = data.codes.find((item) => item.table?.id === table.id);
                  return (
                    <li
                      key={table.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-ink">{table.label}</span>
                        {!table.active && <Badge>Not in use</Badge>}
                        {code && code.status !== 'ACTIVE' && <Badge tone="danger">Code off</Badge>}
                        {code && <span className="text-xs text-muted">{code.scanCount} scans</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {code ? (
                          codeActions(code)
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === `create-${table.id}`}
                            onClick={() => void ensureCode('TABLE', table.id)}
                          >
                            Generate QR
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (
                              !window.confirm(`Delete ${table.label}? Its QR code stops working.`)
                            )
                              return;
                            void run(
                              `del-${table.id}`,
                              () => ordersService.deleteTable(placeId, table.id),
                              'Table deleted',
                            ).then(refresh);
                          }}
                        >
                          <Icon name="trash" className="size-4" label={`Delete ${table.label}`} />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`QR code for ${preview.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-full flex-col gap-3 overflow-auto rounded-lg bg-surface p-4"
            onClick={(event) => event.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL. */}
            <img
              src={preview.src}
              alt={`CampusPin QR card for ${preview.name}`}
              className="w-72 max-w-full"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => printCards([preview.src], preview.name)}>
                <Icon name="printer" className="size-4" /> Print
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadDataUrl(preview.src, `campuspin-${fileSafe(preview.name)}.png`)
                }
              >
                <Icon name="download" className="size-4" /> Download
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
