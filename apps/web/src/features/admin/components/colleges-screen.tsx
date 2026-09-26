'use client';

import { type CollegeStatus, type VerificationStatus } from '@platform/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { adminService } from '@/services/admin.service';
import {
  AdminHeader,
  PRIMARY_LINK_CLASSES,
  Pagination,
  SEARCH_CLASSES,
  SELECT_CLASSES,
  useAdminList,
} from './admin-ui';

export const COLLEGE_STATUS: Record<CollegeStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Live', tone: 'success' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
};

export function CollegesScreen() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<CollegeStatus | ''>('');
  const [verification, setVerification] = useState<VerificationStatus | ''>('');
  const [page, setPage] = useState(1);
  const list = useAdminList(
    (signal) =>
      adminService.colleges(
        {
          page,
          ...(q ? { q } : {}),
          ...(status ? { status } : {}),
          ...(verification ? { verification } : {}),
        },
        signal,
      ),
    [q, status, verification, page],
  );

  return (
    <div>
      <AdminHeader
        title="Colleges"
        description="Places within a college's service radius are linked to it automatically."
        action={
          <Link href={ROUTES.adminNewCollege} className={PRIMARY_LINK_CLASSES}>
            + New college
          </Link>
        }
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
          placeholder="Name or city"
          aria-label="Search colleges"
          className={`${SEARCH_CLASSES} w-64`}
        />
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as CollegeStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {(Object.keys(COLLEGE_STATUS) as CollegeStatus[]).map((value) => (
            <option key={value} value={value}>
              {COLLEGE_STATUS[value].label}
            </option>
          ))}
        </select>
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
          <option value="VERIFIED">Verified</option>
          <option value="PENDING">Pending</option>
          <option value="REJECTED">Rejected</option>
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
        <EmptyState title="No colleges" description="No colleges match this search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((college) => (
            <li key={college.id}>
              <Link href={ROUTES.adminCollege(college.id)}>
                <Card hover className="flex items-center gap-4 p-3">
                  <div className="size-12 shrink-0 overflow-hidden rounded-md bg-subtle">
                    {college.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- remote logo.
                      <img src={college.logoUrl} alt="" className="size-full object-contain" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-ink">{college.name}</span>
                      <Badge tone={COLLEGE_STATUS[college.status].tone}>
                        {COLLEGE_STATUS[college.status].label}
                      </Badge>
                      {college.verificationStatus === 'VERIFIED' && (
                        <Badge tone="success">Verified</Badge>
                      )}
                      {college.isDemo && <Badge>Demo</Badge>}
                    </div>
                    <span className="text-sm text-body">
                      {college.city}, {college.state}
                    </span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
    </div>
  );
}
