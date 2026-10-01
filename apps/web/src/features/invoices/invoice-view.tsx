'use client';

import { INVOICE_STATUS_LABELS, PAYMENT_STATUS_LABELS, type Invoice } from '@platform/contracts';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { BRAND } from '@/constants/brand';
import { saveBlob } from '@/services/commerce.service';

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

// Only this invoice is printed: the dashboard or site around it is hidden on paper.
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  .invoice-print, .invoice-print * { visibility: visible !important; }
  .invoice-print { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; }
  .invoice-actions { display: none !important; }
}`;

const noSubscribe = () => () => undefined;

/**
 * An invoice as a clean document (the same content as the PDF), with Print, Download PDF and, where
 * the device can share files, Share. Used by the business and by the student who ordered.
 */
export function InvoiceView({
  invoice,
  loadPdf,
}: {
  invoice: Invoice;
  loadPdf: () => Promise<Blob>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<'pdf' | 'share' | null>(null);
  const fileName = `invoice-${invoice.number}.pdf`;
  // Decided in the browser only (the server has no navigator).
  const canShareFiles = useSyncExternalStore(
    noSubscribe,
    () =>
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], fileName, { type: 'application/pdf' })] }),
    () => false,
  );

  async function download() {
    setBusy('pdf');
    try {
      saveBlob(await loadPdf(), fileName);
    } catch {
      toast.show('Could not download the PDF. Try again.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setBusy('share');
    try {
      const file = new File([await loadPdf()], fileName, { type: 'application/pdf' });
      await navigator.share({
        files: [file],
        title: `Invoice ${invoice.number}`,
        text: `${invoice.business.name} invoice ${invoice.number}`,
      });
    } catch {
      // Dismissed or not possible: nothing to do.
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="invoice-actions mb-4 flex flex-wrap gap-2">
        <Button onClick={() => void download()} loading={busy === 'pdf'}>
          <Icon name="download" className="size-4" /> Download PDF
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          <Icon name="printer" className="size-4" /> Print
        </Button>
        {canShareFiles && (
          <Button variant="secondary" onClick={() => void share()} loading={busy === 'share'}>
            <Icon name="share" className="size-4" /> Share
          </Button>
        )}
      </div>

      <article className="invoice-print overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
        <div className="h-1.5 bg-primary-600" />
        <div className="flex flex-col gap-8 p-5 sm:p-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-ink sm:text-2xl">{invoice.business.name}</h1>
              <p className="text-sm text-muted">{invoice.business.address}</p>
              <p className="text-sm text-muted">
                {[invoice.business.phone, invoice.business.email].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-2xl font-bold tracking-wide text-primary-600">INVOICE</p>
              <p className="font-semibold text-ink">{invoice.number}</p>
              <p className="text-sm text-muted">Date: {date(invoice.issuedAt)}</p>
              <p className="text-sm text-muted">Status: {INVOICE_STATUS_LABELS[invoice.status]}</p>
            </div>
          </header>

          <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Billed to</p>
              <p className="font-semibold text-ink">{invoice.customer.name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Order</p>
              <p className="font-semibold text-ink">{invoice.order.code}</p>
              <p className="text-sm text-muted">
                Placed {date(invoice.order.placedAt)}
                {invoice.order.table ? ` · ${invoice.order.table}` : ''}
              </p>
            </div>
          </div>

          <div>
            <div className="hidden grid-cols-[1fr_4rem_6rem_6rem] gap-2 rounded-lg bg-subtle px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase sm:grid">
              <span>Item</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Amount</span>
            </div>
            <ul className="divide-y divide-line">
              {invoice.items.map((item, index) => (
                <li
                  key={index}
                  className="grid grid-cols-[1fr_auto] gap-x-2 px-3 py-3 text-sm sm:grid-cols-[1fr_4rem_6rem_6rem]"
                >
                  <div className="min-w-0">
                    <p className="text-ink">{item.name}</p>
                    {item.options.length > 0 && (
                      <p className="text-xs text-muted">+ {item.options.join(', ')}</p>
                    )}
                    <p className="text-xs text-muted sm:hidden">
                      {item.quantity} × {rupees(item.unitPrice)}
                    </p>
                  </div>
                  <span className="hidden text-right sm:block">{item.quantity}</span>
                  <span className="hidden text-right sm:block">{rupees(item.unitPrice)}</span>
                  <span className="text-right font-medium text-ink">{rupees(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{rupees(invoice.subtotal)}</dd>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Discount</dt>
                <dd>− {rupees(invoice.discount)}</dd>
              </div>
            )}
            {invoice.tax > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Tax</dt>
                <dd>{rupees(invoice.tax)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-ink pt-2 text-base font-bold text-ink">
              <dt>Grand total</dt>
              <dd>{rupees(invoice.total)}</dd>
            </div>
          </dl>

          <div className="border-t border-line pt-5">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Payment</p>
            <p className="font-semibold text-ink">
              {PAYMENT_STATUS_LABELS[invoice.paymentStatus]}
              {invoice.paidAt ? ` on ${date(invoice.paidAt)}` : ''}
            </p>
            <p className="text-sm text-muted">Method: {invoice.paymentMethod}</p>
          </div>

          <p className="border-t border-line pt-4 text-xs text-muted">
            {invoice.business.name} · Invoice {invoice.number} · Generated with {BRAND.name}
          </p>
        </div>
      </article>
    </div>
  );
}
