'use client';

import { QrLanding } from '@/features/orders/components/qr-landing';
import { OfferCard } from '@/features/offers/components/offer-card';
import { TableRequests } from './table-requests';

/** A scanned CampusPin code: table requests (at a table), student offers, then the menu. */
export function ScanLanding({ token }: { token: string }) {
  return (
    <QrLanding
      token={token}
      extra={(services, qrToken, table) => (
        <div className="flex flex-col gap-4">
          {table && (
            <TableRequests types={services.tableRequests} qrToken={qrToken} table={table} />
          )}
          {services.offers.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {services.offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} showPlace={false} />
              ))}
            </div>
          )}
        </div>
      )}
    />
  );
}
