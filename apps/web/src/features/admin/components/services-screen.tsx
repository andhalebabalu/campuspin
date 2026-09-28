'use client';

import { SERVICE_KINDS, type AdminServiceType, type ServiceKind } from '@platform/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { dayLabel, mealLines, serviceIcon } from '@/features/services/lib/service-meta';
import { useSession } from '@/lib/auth/session-context';
import { engagementService } from '@/services/engagement.service';
import { ordersService } from '@/services/orders.service';
import { servicesService } from '@/services/services.service';
import { can } from '../lib/access';
import {
  AdminHeader,
  Pagination,
  ReasonDialog,
  SEARCH_CLASSES,
  SELECT_CLASSES,
  errorMessage,
  useAdminList,
  type ReasonRequest,
} from './admin-ui';

type Tab = 'types' | 'places' | 'orders' | 'requests' | 'menus' | 'offers' | 'qr';

const KIND_LABELS: Record<ServiceKind, string> = {
  FOOD_ORDER: 'Food ordering',
  DAILY_MENU: 'Daily menu',
  TABLE_SERVICE: 'Table service',
  PRINT_ORDER: 'Print orders',
  SERVICE_REQUEST: 'Service requests',
  BOOKING: 'Bookings',
  OFFERS: 'Offers',
  LISTING: 'Listing (discovery only)',
};

function ServiceTypesTab() {
  const toast = useToast();
  const list = useAdminList((signal) => servicesService.adminTypes(signal), []);
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function patch(
    type: AdminServiceType,
    dto: Parameters<typeof servicesService.updateType>[1],
  ) {
    try {
      const result = await servicesService.updateType(type.id, dto);
      list.replace((item) => item.id === type.id, result.data);
      toast.show('Saved');
    } catch (caught) {
      toast.show(errorMessage(caught, 'Could not save.'), 'error');
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setProblem(null);
    try {
      await servicesService.createType({
        key: String(form.get('key') ?? ''),
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? '') || null,
        icon: String(form.get('icon') ?? '') || null,
        kind: String(form.get('kind')) as ServiceKind,
        showOnHome: form.get('showOnHome') === 'on',
        categorySlug: String(form.get('categorySlug') ?? '') || null,
        status: 'ACTIVE',
        sortOrder: Number(form.get('sortOrder') ?? 0),
      });
      setCreating(false);
      list.reload();
      toast.show('Service type created');
    } catch (caught) {
      setProblem(errorMessage(caught, 'Could not create it.'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant={creating ? 'secondary' : 'primary'}
          onClick={() => setCreating(!creating)}
        >
          {creating ? 'Cancel' : '+ New service type'}
        </Button>
      </div>
      {creating && (
        <Card className="p-5">
          <form onSubmit={(event) => void create(event)} className="grid gap-3 sm:grid-cols-2">
            <input
              name="key"
              required
              placeholder="KEY, e.g. TAILORING"
              className={SEARCH_CLASSES}
            />
            <input
              name="name"
              required
              placeholder="Name shown to students"
              className={SEARCH_CLASSES}
            />
            <input
              name="description"
              placeholder="Short description"
              className={`${SEARCH_CLASSES} sm:col-span-2`}
            />
            <select name="kind" className={SELECT_CLASSES} defaultValue="SERVICE_REQUEST">
              {SERVICE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <input name="icon" placeholder="Icon key, e.g. repair" className={SEARCH_CLASSES} />
            <input
              name="categorySlug"
              placeholder="Category slug (Listing kind only)"
              className={SEARCH_CLASSES}
            />
            <input
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={100}
              className={SEARCH_CLASSES}
            />
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="showOnHome" /> Show as a quick action on the student home
            </label>
            {problem && <p className="text-sm text-danger-700 sm:col-span-2">{problem}</p>}
            <Button type="submit" size="sm" className="w-fit">
              Create
            </Button>
          </form>
        </Card>
      )}
      {list.error ? (
        <ErrorState
          message={list.error.message}
          requestId={list.error.requestId}
          onRetry={list.reload}
        />
      ) : !list.items ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((type) => (
            <li key={type.id}>
              <Card className="flex flex-wrap items-center gap-4 p-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                  <Icon name={serviceIcon(type.icon)} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{type.name}</span>
                    <code className="text-xs text-muted">{type.key}</code>
                    <Badge>{KIND_LABELS[type.kind]}</Badge>
                    {type.status === 'INACTIVE' && <Badge tone="danger">Hidden</Badge>}
                  </div>
                  <p className="text-sm text-body">
                    {type.placeCount} {type.placeCount === 1 ? 'place uses' : 'places use'} it
                    {type.description ? ` · ${type.description}` : ''}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={type.showOnHome}
                    onChange={(event) => void patch(type, { showOnHome: event.target.checked })}
                  />
                  Quick action
                </label>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void patch(type, { status: type.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
                  }
                >
                  {type.status === 'ACTIVE' ? 'Hide' : 'Show'}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaceServicesTab() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) =>
      servicesService.adminPlaceServices(
        { page, ...(q ? { q } : {}), ...(serviceType ? { serviceType } : {}) },
        signal,
      ),
    [q, serviceType, page],
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQ(qInput.trim());
          setPage(1);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          aria-label="Search places"
          placeholder="Search place name"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          className={`${SEARCH_CLASSES} w-56`}
        />
        <input
          aria-label="Service type key"
          placeholder="Service key, e.g. ORDER_FOOD"
          value={serviceType}
          onChange={(event) => {
            setServiceType(event.target.value.toUpperCase());
            setPage(1);
          }}
          className={`${SEARCH_CLASSES} w-56`}
        />
        <Button type="submit" size="sm" variant="secondary">
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
        <EmptyState title="No business services" description="Nothing matches this filter." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((row) => (
            <li key={row.id}>
              <Card className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={ROUTES.placeDetail(row.place.slug)}
                      target="_blank"
                      className="font-semibold text-ink hover:text-action"
                    >
                      {row.place.name}
                    </Link>
                    <Badge>{row.serviceType.name}</Badge>
                    {row.disabledByAdmin ? (
                      <Badge tone="danger">Switched off by staff</Badge>
                    ) : row.enabled ? (
                      <Badge tone="success">On</Badge>
                    ) : (
                      <Badge>Off (by business)</Badge>
                    )}
                  </div>
                  <p className="text-sm text-body">
                    {row.business?.name ?? 'No business'}
                    {row.adminNote ? ` · Note: ${row.adminNote}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={row.disabledByAdmin ? 'secondary' : 'danger'}
                  onClick={() =>
                    setDialog({
                      title: row.disabledByAdmin
                        ? 'Switch this service back on?'
                        : 'Switch this service off?',
                      description: row.disabledByAdmin
                        ? 'The business decides again whether it is on.'
                        : 'It stays off whatever the business chooses. The business sees your note.',
                      confirmLabel: row.disabledByAdmin ? 'Switch on' : 'Switch off',
                      required: !row.disabledByAdmin,
                      danger: !row.disabledByAdmin,
                      onConfirm: async (reason) => {
                        const result = await servicesService.adminUpdatePlaceService(row.id, {
                          disabledByAdmin: !row.disabledByAdmin,
                          adminNote: reason || null,
                        });
                        list.replace((item) => item.id === row.id, result.data);
                      },
                    })
                  }
                >
                  {row.disabledByAdmin ? 'Switch on' : 'Switch off'}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function MenusTab() {
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) => servicesService.adminMenus({ page, ...(date ? { date } : {}) }, signal),
    [date, page],
  );

  return (
    <div className="flex flex-col gap-4">
      <label className="flex w-fit items-center gap-2 text-sm text-ink">
        Date
        <input
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setPage(1);
          }}
          className={SEARCH_CLASSES}
        />
      </label>
      {list.error ? (
        <ErrorState
          message={list.error.message}
          requestId={list.error.requestId}
          onRetry={list.reload}
        />
      ) : !list.items ? (
        <Skeleton className="h-64 w-full" />
      ) : list.items.length === 0 ? (
        <EmptyState title="No menus" description="Nothing matches this filter." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((menu) => (
            <li key={menu.id}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={ROUTES.placeDetail(menu.place.slug)}
                      target="_blank"
                      className="font-semibold text-ink hover:text-action"
                    >
                      {menu.place.name}
                    </Link>
                    <span className="text-sm text-muted">{dayLabel(menu.date)}</span>
                    <Badge
                      tone={
                        menu.status === 'PUBLISHED'
                          ? 'success'
                          : menu.status === 'REMOVED'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {menu.status === 'PUBLISHED'
                        ? 'Published'
                        : menu.status === 'REMOVED'
                          ? 'Removed'
                          : 'Draft'}
                    </Badge>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1 text-sm text-body">
                    {mealLines(menu.meals).map((line) => (
                      <li key={line.label}>
                        <span className="font-medium text-ink">{line.label}:</span> {line.dishes}
                      </li>
                    ))}
                  </ul>
                  {menu.removedReason && (
                    <p className="mt-1 text-sm text-muted">Removed: {menu.removedReason}</p>
                  )}
                </div>
                {menu.status === 'REMOVED' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setDialog({
                        title: 'Put this menu back?',
                        confirmLabel: 'Restore',
                        required: false,
                        onConfirm: async () => {
                          const result = await servicesService.adminRestoreMenu(menu.id);
                          list.replace((item) => item.id === menu.id, result.data);
                        },
                      })
                    }
                  >
                    Restore
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      setDialog({
                        title: 'Take this menu down?',
                        description:
                          'Students stop seeing it. The mess sees your reason and can fix it.',
                        confirmLabel: 'Remove',
                        required: true,
                        danger: true,
                        onConfirm: async (reason) => {
                          const result = await servicesService.adminRemoveMenu(menu.id, reason);
                          list.replace((item) => item.id === menu.id, result.data);
                        },
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function OrdersTab() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminList(
    (signal) => ordersService.adminOrders({ page, ...(q ? { q } : {}) }, signal),
    [q, page],
  );
  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQ(qInput.trim());
          setPage(1);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          aria-label="Order code or place"
          placeholder="Order code or place name"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          className={`${SEARCH_CLASSES} w-64`}
        />
        <Button type="submit" size="sm" variant="secondary">
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
        <EmptyState title="No orders" description="Nothing matches this search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((order) => (
            <li key={order.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-semibold text-ink">
                    {order.code} · {order.place.name}
                    {order.table ? ` · ${order.table}` : ''}
                  </p>
                  <p className="text-body">
                    {order.student.name} · {order.items.length} lines · ₹{order.total} ·{' '}
                    {new Date(order.createdAt).toLocaleString('en-IN')}
                  </p>
                  {order.statusReason && <p className="text-muted">Reason: {order.statusReason}</p>}
                </div>
                <Badge
                  tone={
                    order.status === 'CANCELLED' || order.status === 'REJECTED'
                      ? 'danger'
                      : order.status === 'COMPLETED'
                        ? 'success'
                        : 'accent'
                  }
                >
                  {order.statusLabel}
                </Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
    </div>
  );
}

function QrTab() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) => ordersService.adminQrCodes({ page, ...(q ? { q } : {}) }, signal),
    [q, page],
  );
  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQ(qInput.trim());
          setPage(1);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          aria-label="Place name"
          placeholder="Place name"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          className={`${SEARCH_CLASSES} w-64`}
        />
        <Button type="submit" size="sm" variant="secondary">
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
        <EmptyState title="No QR codes" description="Nothing matches this search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((code) => (
            <li key={code.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-semibold text-ink">
                    {code.place.name} · {code.table ? code.table.label : 'Business code'}
                  </p>
                  <p className="text-body">
                    {code.scanCount} scans · created{' '}
                    {new Date(code.createdAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
                {code.status === 'ACTIVE' ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      setDialog({
                        title: 'Switch this QR code off?',
                        description: 'Scans stop working. The business can make a new one.',
                        confirmLabel: 'Switch off',
                        required: false,
                        danger: true,
                        onConfirm: async () => {
                          await ordersService.adminDisableQr(code.id);
                          list.replace((item) => item.id === code.id, {
                            ...code,
                            status: 'DISABLED',
                          });
                        },
                      })
                    }
                  >
                    Switch off
                  </Button>
                ) : (
                  <Badge tone="danger">Off</Badge>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function RequestsTab() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminList(
    (signal) => engagementService.adminRequests({ page, ...(q ? { q } : {}) }, signal),
    [q, page],
  );
  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQ(qInput.trim());
          setPage(1);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          aria-label="Request code or place"
          placeholder="Request code or place name"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          className={`${SEARCH_CLASSES} w-64`}
        />
        <Button type="submit" size="sm" variant="secondary">
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
        <EmptyState title="No requests" description="Nothing matches this search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((request) => (
            <li key={request.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-semibold text-ink">
                    {request.code} · {request.label} · {request.place.name}
                    {request.table ? ` · ${request.table}` : ''}
                  </p>
                  <p className="text-body">
                    {request.student.name} · {new Date(request.createdAt).toLocaleString('en-IN')}
                    {request.estimateAmount !== null
                      ? ` · estimate ₹${request.estimateAmount}`
                      : ''}
                  </p>
                </div>
                <Badge>{request.statusLabel}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
    </div>
  );
}

function OffersTab() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) => engagementService.adminOffers({ page, ...(q ? { q } : {}) }, signal),
    [q, page],
  );
  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQ(qInput.trim());
          setPage(1);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          aria-label="Offer or place"
          placeholder="Offer title or place name"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          className={`${SEARCH_CLASSES} w-64`}
        />
        <Button type="submit" size="sm" variant="secondary">
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
        <EmptyState title="No offers" description="Nothing matches this search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((offer) => (
            <li key={offer.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-semibold text-ink">
                    {offer.title} · {offer.place.name}
                  </p>
                  <p className="text-body">
                    {offer.business.name} · used {offer.redeemedCount} times
                    {offer.terms ? ` · terms: ${offer.terms}` : ''}
                  </p>
                  {offer.removedReason && (
                    <p className="text-muted">Removed: {offer.removedReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      offer.status === 'REMOVED'
                        ? 'danger'
                        : offer.status === 'ACTIVE'
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {offer.status.toLowerCase()}
                  </Badge>
                  {offer.status === 'REMOVED' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setDialog({
                          title: 'Put this offer back (paused)?',
                          description: 'The business can resume it.',
                          confirmLabel: 'Restore',
                          required: false,
                          onConfirm: async () => {
                            const result = await engagementService.adminRestoreOffer(offer.id);
                            list.replace((item) => item.id === offer.id, result.data);
                          },
                        })
                      }
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        setDialog({
                          title: 'Take this offer down?',
                          description:
                            'Students stop seeing it and codes stop working. The business sees your reason.',
                          confirmLabel: 'Remove',
                          required: true,
                          danger: true,
                          onConfirm: async (reason) => {
                            const result = await engagementService.adminRemoveOffer(
                              offer.id,
                              reason,
                            );
                            list.replace((item) => item.id === offer.id, result.data);
                          },
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

/** Staff view of daily-use services: the catalogue, per-business overrides and content moderation. */
export function ServicesScreen() {
  const { user } = useSession();
  const manage = can(user, 'services.manage');
  const tabs: Array<{ id: Tab; label: string }> = [
    ...(manage
      ? [
          { id: 'types' as const, label: 'Service types' },
          { id: 'places' as const, label: 'Business services' },
          { id: 'orders' as const, label: 'Order log' },
          { id: 'requests' as const, label: 'Request log' },
        ]
      : []),
    { id: 'menus', label: 'Mess menus' },
    { id: 'offers', label: 'Offers' },
    { id: 'qr', label: 'QR codes' },
  ];
  const [tab, setTab] = useState<Tab>(manage ? 'types' : 'menus');

  return (
    <div>
      <AdminHeader
        title="Services"
        description="What businesses offer through CampusPin: the quick actions, which businesses have each switched on, and the content they publish."
      />
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${
              tab === item.id
                ? 'border-accent-600 text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'types' && <ServiceTypesTab />}
      {tab === 'places' && <PlaceServicesTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'menus' && <MenusTab />}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'offers' && <OffersTab />}
      {tab === 'qr' && <QrTab />}
    </div>
  );
}
