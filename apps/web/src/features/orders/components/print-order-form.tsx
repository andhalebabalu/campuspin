'use client';

import { ApiClientError } from '@platform/api-client';
import {
  PAPER_SIZES,
  PRINT_MAX_BYTES,
  PRINT_MAX_COPIES,
  pricePrintJob,
  type PaperSize,
  type PlaceServices,
  type PrintOrderConfig,
  type PrivateDocument,
} from '@platform/contracts';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { ordersService } from '@/services/orders.service';
import { servicesService } from '@/services/services.service';
import { rupees } from '../lib/use-cart';

function Choice({
  on,
  label,
  onClick,
  disabled,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-40 ${on ? 'border-primary-700 bg-primary-50 text-primary-800' : 'border-line text-body hover:bg-subtle'}`}
    >
      {label}
    </button>
  );
}

/**
 * Send a PDF to a print shop: upload, choose copies and options, see the price (the same sum the
 * server works out), pick up and pay at the shop. The file is private to the student and the shop.
 */
export function PrintOrderForm({ placeSlug }: { placeSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { status } = useSession();
  const [data, setData] = useState<PlaceServices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<PrivateDocument | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copies, setCopies] = useState(1);
  const [color, setColor] = useState(false);
  const [doubleSided, setDoubleSided] = useState(false);
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [binding, setBinding] = useState(false);
  const [lamination, setLamination] = useState(false);
  const [pickupAt, setPickupAt] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    servicesService
      .placeServices(placeSlug, controller.signal)
      .then((result) => setData(result.data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load the shop.');
      });
    return () => controller.abort();
  }, [placeSlug]);

  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!data) return <Skeleton className="h-96 w-full" />;
  const print = data.services.find((service) => service.kind === 'PRINT_ORDER');
  if (!print) {
    return (
      <EmptyState
        title={`${data.name} doesn't take print orders on CampusPin`}
        action={
          <Link
            href={ROUTES.serviceType('PRINT')}
            className="text-sm font-semibold text-primary-700"
          >
            Find a print shop
          </Link>
        }
      />
    );
  }
  const config = print.config as PrintOrderConfig;
  const options = { copies, color, doubleSided, paperSize, binding, lamination };
  const priced = document?.pageCount ? pricePrintJob(config, document.pageCount, options) : null;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > PRINT_MAX_BYTES) {
      setProblem('The PDF is larger than 20 MB. Compress it first.');
      return;
    }
    setUploading(true);
    setProblem(null);
    try {
      const result = await ordersService.uploadDocument(file);
      if (result.data.kind !== 'PRINT') {
        setProblem('Upload a PDF. Photos are not printed here.');
        return;
      }
      setDocument(result.data);
      idempotencyKey.current = null;
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const fields = caught.details?.fields as Record<string, string[]> | undefined;
        setProblem(fields ? Object.values(fields).flat().join(' ') : caught.message);
      } else setProblem('Upload failed. Check your connection.');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!document || !data) return;
    setPlacing(true);
    setProblem(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const result = await ordersService.placePrintOrder({
        placeId: data.placeId,
        documentId: document.id,
        ...options,
        ...(pickupAt ? { pickupAt: new Date(pickupAt).toISOString() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        idempotencyKey: idempotencyKey.current,
      });
      toast.show(`Print order ${result.data.code} sent`);
      router.push(ROUTES.order(result.data.id));
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const fields = caught.details?.fields as Record<string, string[]> | undefined;
        setProblem(fields ? Object.values(fields).flat().join(' ') : caught.message);
        if (caught.status < 500) idempotencyKey.current = null;
      } else setProblem('Could not reach CampusPin. Try again.');
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-accent-700">Print, xerox, binding</p>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{data.name}</h1>
        {!config.acceptingOrders && (
          <p className="mt-2 text-sm text-amber-600">Not taking print orders right now.</p>
        )}
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <p className="font-semibold text-ink">1. Your PDF</p>
        {document ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-subtle px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-ink">
              <Icon name="book" className="size-5 text-primary-700" /> {document.fileName} ·{' '}
              {document.pageCount} pages
            </span>
            <label className="cursor-pointer text-sm font-semibold text-primary-700">
              Change
              <input
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(event) => void onFile(event)}
              />
            </label>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line px-6 py-10 text-center hover:bg-subtle">
            <Icon name="printer" className="size-8 text-primary-700" />
            <span className="font-medium text-ink">
              {uploading ? 'Uploading…' : 'Choose a PDF'}
            </span>
            <span className="text-xs text-muted">
              Up to 20 MB. Only you and {data.name} can see it; it is deleted when the job is done.
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              disabled={uploading || status !== 'authenticated'}
              onChange={(event) => void onFile(event)}
            />
          </label>
        )}
        {status !== 'authenticated' && (
          <Link
            href={`${ROUTES.login}?next=${encodeURIComponent(pathname)}`}
            className="text-sm font-semibold text-primary-700"
          >
            Sign in to upload
          </Link>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <p className="font-semibold text-ink">2. Options</p>
        <label className="flex items-center gap-3 text-sm text-ink">
          Copies
          <input
            type="number"
            min={1}
            max={PRINT_MAX_COPIES}
            value={copies}
            onChange={(event) =>
              setCopies(
                Math.min(
                  PRINT_MAX_COPIES,
                  Math.max(1, Math.round(Number(event.target.value) || 1)),
                ),
              )
            }
            className="h-10 w-24 rounded-md border border-control px-3"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Choice
            on={!color}
            label={`B/W · ${rupees(config.bwPricePerPage)}/page`}
            onClick={() => setColor(false)}
          />
          <Choice
            on={color}
            label={
              config.colorPricePerPage === null
                ? 'Colour: not offered'
                : `Colour · ${rupees(config.colorPricePerPage)}/page`
            }
            disabled={config.colorPricePerPage === null}
            onClick={() => setColor(true)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Choice on={!doubleSided} label="Single-sided" onClick={() => setDoubleSided(false)} />
          <Choice
            on={doubleSided}
            label="Double-sided"
            disabled={!config.doubleSided}
            onClick={() => setDoubleSided(true)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {PAPER_SIZES.filter((size) => config.paperSizes.includes(size)).map((size) => (
            <Choice
              key={size}
              on={paperSize === size}
              label={size}
              onClick={() => setPaperSize(size)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {config.bindingPrice !== null && (
            <Choice
              on={binding}
              label={`Binding · ${rupees(config.bindingPrice)}`}
              onClick={() => setBinding(!binding)}
            />
          )}
          {config.laminationPricePerPage !== null && (
            <Choice
              on={lamination}
              label={`Lamination · ${rupees(config.laminationPricePerPage)}/page`}
              onClick={() => setLamination(!lamination)}
            />
          )}
        </div>
        <label className="flex flex-col gap-1.5 text-sm text-ink">
          Pickup time (optional)
          <input
            type="datetime-local"
            value={pickupAt}
            onChange={(event) => setPickupAt(event.target.value)}
            className="h-10 w-fit rounded-md border border-control px-3"
          />
        </label>
        <input
          value={note}
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note for the shop (optional)"
          aria-label="Note"
          className="h-10 rounded-md border border-control px-3 text-sm"
        />
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <p className="font-semibold text-ink">3. Price</p>
        {!document ? (
          <p className="text-sm text-muted">Upload your PDF to see the price.</p>
        ) : priced && 'problem' in priced ? (
          <p className="text-sm text-danger-700">{priced.problem}</p>
        ) : priced ? (
          <>
            <ul className="flex flex-col gap-1 text-sm">
              {priced.lines.map((line) => (
                <li key={line.name} className="flex justify-between gap-3">
                  <span className="text-body">
                    {line.name} × {line.quantity}
                  </span>
                  <span className="text-ink">{rupees(line.unitPrice * line.quantity)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between border-t border-line pt-2 text-lg font-bold text-ink">
              Total <span>{rupees(priced.subtotal)}</span>
            </p>
            <p className="text-xs text-muted">Pay at pickup. The shop sees the same price.</p>
          </>
        ) : null}
        {problem && (
          <p role="alert" className="text-sm text-danger-700">
            {problem}
          </p>
        )}
        <Button
          className="self-start"
          loading={placing}
          disabled={!document || !priced || 'problem' in priced || !config.acceptingOrders}
          onClick={() => void submit()}
        >
          Send to {data.name}
        </Button>
      </Card>
    </div>
  );
}
