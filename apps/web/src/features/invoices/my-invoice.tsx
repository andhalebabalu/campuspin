'use client';

import { ApiClientError } from '@platform/api-client';
import type { Invoice } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { commerceService } from '@/services/commerce.service';
import { InvoiceView } from './invoice-view';

/** The invoice of one of the signed-in student's orders. */
export function MyInvoice({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    commerceService
      .myInvoice(invoiceId, controller.signal)
      .then((result) => {
        setInvoice(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof ApiClientError ? caught.message : 'Could not load the invoice.',
          );
      });
    return () => controller.abort();
  }, [invoiceId, reload]);

  if (error) return <ErrorState message={error} onRetry={() => setReload((count) => count + 1)} />;
  if (!invoice) return <Skeleton className="h-[36rem] w-full rounded-2xl" />;
  return (
    <>
      <Link
        href={ROUTES.order(invoice.order.id)}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-action"
      >
        <Icon name="arrowLeft" className="size-4" /> Order {invoice.order.code}
      </Link>
      <InvoiceView invoice={invoice} loadPdf={() => commerceService.myInvoicePdf(invoice.id)} />
    </>
  );
}
