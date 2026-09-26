'use client';

import {
  VERIFICATION_STATUSES,
  type AdminBusiness,
  type VerificationStatus,
} from '@platform/contracts';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { adminService } from '@/services/admin.service';
import {
  AdminHeader,
  Pagination,
  ReasonDialog,
  SEARCH_CLASSES,
  SELECT_CLASSES,
  dateFormat,
  useAdminList,
  type ReasonRequest,
} from './admin-ui';

/** Business accounts and the "verified business" badge students see. */
export function BusinessesScreen({
  initialVerification,
}: {
  initialVerification: VerificationStatus | '';
}) {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [verification, setVerification] = useState<VerificationStatus | ''>(initialVerification);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) =>
      adminService.businesses(
        { page, ...(q ? { q } : {}), ...(verification ? { verification } : {}) },
        signal,
      ),
    [q, verification, page],
  );
  const update = (next: AdminBusiness) => list.replace((item) => item.id === next.id, next);

  return (
    <div>
      <AdminHeader
        title="Businesses"
        description="Verify a business once you have confirmed it is real and run by this owner."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQ(qInput.trim());
          setPage(1);
        }}
        className="mb-4 flex flex-wrap gap-3"
      >
        <input
          type="search"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          placeholder="Business name or owner email"
          aria-label="Search businesses"
          className={`${SEARCH_CLASSES} w-72`}
        />
        <select
          aria-label="Verification"
          value={verification}
          onChange={(event) => {
            setVerification(event.target.value as VerificationStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">Any verification</option>
          {VERIFICATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0) + value.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm" className="h-10">
          Search
        </Button>
      </form>

      {list.error ? (
        <ErrorState
          message={list.error.message}
          requestId={list.error.requestId}
          onRetry={list.reload}
        />
      ) : !list.items ? (
        <Skeleton className="h-64 w-full" />
      ) : list.items.length === 0 ? (
        <EmptyState title="No businesses" description="No business accounts match this search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((business) => {
            const verified = business.verificationStatus === 'VERIFIED';
            return (
              <li key={business.id}>
                <Card className="flex flex-wrap items-center gap-4 p-4">
                  <div className="size-12 shrink-0 overflow-hidden rounded-full border border-line bg-subtle">
                    {business.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API.
                      <img src={business.logoUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center font-bold text-primary-800">
                        {business.businessName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{business.businessName}</span>
                      <Badge tone={verified ? 'success' : 'neutral'}>
                        {verified ? 'Verified' : business.verificationStatus.toLowerCase()}
                      </Badge>
                    </div>
                    <span className="text-sm text-body">
                      {business.owner.name} · {business.owner.email}
                      {business.phone ? ` · ${business.phone}` : ''}
                    </span>
                    <span className="text-xs text-muted">
                      {business.liveListingCount} live of {business.listingCount} listings · joined{' '}
                      {dateFormat.format(new Date(business.createdAt))}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant={verified ? 'secondary' : 'primary'}
                    onClick={() =>
                      setDialog({
                        title: verified
                          ? `Remove verification from ${business.businessName}?`
                          : `Verify ${business.businessName}?`,
                        description: verified
                          ? 'Students will no longer see it as a verified business.'
                          : 'Students will see it as a verified business.',
                        confirmLabel: verified ? 'Remove verification' : 'Verify',
                        required: false,
                        danger: verified,
                        onConfirm: async (reason) =>
                          update(
                            (
                              await adminService.businessAction(
                                business.id,
                                verified ? 'unverify' : 'verify',
                                reason,
                              )
                            ).data,
                          ),
                      })
                    }
                  >
                    {verified ? 'Unverify' : 'Verify'}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
