'use client';

import type { BusinessListing } from '@platform/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { LISTING_STATUS, dateFormat } from '../lib/labels';
import { ReviewQrDialog } from './review-qr-dialog';

export const ADD_LISTING_CLASSES =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-medium text-white transition-colors hover:bg-action-hover';

/** Every listing of the business with its review state, enquiry counts and rating. */
export function ListingsPanel({
  listings,
  onShowEnquiries,
}: {
  listings: BusinessListing[];
  onShowEnquiries: (placeId: string) => void;
}) {
  const [qrListing, setQrListing] = useState<BusinessListing | null>(null);

  if (listings.length === 0) {
    return (
      <EmptyState
        title="No listings yet"
        description="Add your place with its exact map location and photos. It goes live once our team approves it."
        action={
          <Link href={ROUTES.dashboardNewListing} className={ADD_LISTING_CLASSES}>
            Add your first listing
          </Link>
        }
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {listings.map((listing) => {
          const status = LISTING_STATUS[listing.status];
          return (
            <li key={listing.id}>
              <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="size-20 shrink-0 overflow-hidden rounded-md bg-subtle">
                  {listing.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API.
                    <img src={listing.coverImageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted">
                      <Icon name="store" className="size-7" />
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-ink">{listing.name}</h3>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="text-sm text-body">
                    {[listing.primaryCategory?.name, listing.city].filter(Boolean).join(' · ')} ·
                    Added {dateFormat.format(new Date(listing.createdAt))}
                  </p>
                  {listing.status === 'PENDING' && (
                    <p className="text-sm text-muted">
                      Our team is checking the details. It will be visible to students once
                      approved.
                    </p>
                  )}
                  {listing.status === 'REJECTED' && (
                    <p className="text-sm text-danger-700">
                      {listing.review?.status === 'DUPLICATE'
                        ? 'This place is already listed.'
                        : 'Not approved.'}
                      {listing.review?.note ? ` Reason: ${listing.review.note}` : ''}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-4 text-sm sm:flex-col sm:items-end sm:gap-1">
                  <span className="text-body">
                    {listing.ratingCount > 0
                      ? `★ ${listing.ratingAverage.toFixed(1)} (${listing.ratingCount})`
                      : 'No reviews yet'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onShowEnquiries(listing.id)}
                    className="font-medium text-action hover:text-action-hover"
                  >
                    {listing.enquiryCount} {listing.enquiryCount === 1 ? 'enquiry' : 'enquiries'}
                    {listing.newEnquiryCount > 0 && ` (${listing.newEnquiryCount} new)`}
                  </button>
                  {listing.status === 'ACTIVE' && (
                    <Link
                      href={ROUTES.placeDetail(listing.slug)}
                      className="font-medium text-action hover:text-action-hover"
                    >
                      View public page
                    </Link>
                  )}
                  {listing.status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => setQrListing(listing)}
                      className="inline-flex items-center gap-1.5 font-medium text-action hover:text-action-hover"
                    >
                      <Icon name="qr" className="size-4" />
                      Review QR code
                    </button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <ReviewQrDialog listing={qrListing} onClose={() => setQrListing(null)} />
    </>
  );
}
