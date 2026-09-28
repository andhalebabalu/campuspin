'use client';

import { ApiClientError } from '@platform/api-client';
import {
  PAYMENT_LABELS,
  type FoodOrderConfig,
  type ItemOption,
  type PaymentMethod,
  type PlaceServices,
  type ServiceItem,
} from '@platform/contracts';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { rupees, useCart, type CartLine } from '../lib/use-cart';

function VegDot({ isVeg }: { isVeg: boolean | null }) {
  if (isVeg === null) return null;
  return (
    <span
      title={isVeg ? 'Veg' : 'Non-veg'}
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded-sm border ${
        isVeg ? 'border-success-600' : 'border-danger-600'
      }`}
    >
      <span className={`size-2 rounded-full ${isVeg ? 'bg-success-600' : 'bg-danger-600'}`} />
    </span>
  );
}

function MenuItemRow({
  item,
  inCart,
  canAdd,
  onAdd,
}: {
  item: ServiceItem;
  inCart: number;
  canAdd: boolean;
  onAdd: (options: ItemOption[]) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const hasOptions = item.options.length > 0;

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-ink">
            <VegDot isVeg={item.isVeg} />
            {item.name}
          </p>
          {item.description && <p className="mt-0.5 text-sm text-body">{item.description}</p>}
          <p className="mt-1 text-sm font-semibold text-ink">{rupees(item.price)}</p>
        </div>
        {canAdd && (
          <Button
            size="sm"
            variant={inCart > 0 ? 'primary' : 'secondary'}
            onClick={() => (hasOptions ? setChoosing(!choosing) : onAdd([]))}
            aria-expanded={hasOptions ? choosing : undefined}
          >
            <Icon name="plus" className="size-4" />
            {inCart > 0 ? `Add (${inCart})` : 'Add'}
          </Button>
        )}
      </div>
      {choosing && (
        <div className="flex flex-col gap-2 rounded-lg bg-subtle p-3">
          <p className="text-sm font-medium text-ink">Add-ons</p>
          {item.options.map((option) => (
            <label
              key={option.name}
              className="flex items-center justify-between gap-3 text-sm text-ink"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chosen.includes(option.name)}
                  onChange={(event) =>
                    setChosen(
                      event.target.checked
                        ? [...chosen, option.name]
                        : chosen.filter((name) => name !== option.name),
                    )
                  }
                />
                {option.name}
              </span>
              <span className="text-muted">+{rupees(option.price)}</span>
            </label>
          ))}
          <Button
            size="sm"
            className="self-start"
            onClick={() => {
              onAdd(item.options.filter((option) => chosen.includes(option.name)));
              setChoosing(false);
              setChosen([]);
            }}
          >
            Add to order
          </Button>
        </div>
      )}
    </li>
  );
}

function CartLineRow({
  line,
  onQuantity,
}: {
  line: CartLine;
  onQuantity: (quantity: number) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{line.name}</p>
        {line.options.length > 0 && (
          <p className="text-xs text-muted">
            {line.options.map((option) => option.name).join(', ')}
          </p>
        )}
        <p className="text-sm text-body">{rupees(line.unitPrice * line.quantity)}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onQuantity(line.quantity - 1)}
          className="flex size-9 items-center justify-center rounded-full border border-line hover:bg-subtle"
        >
          <Icon name="minus" className="size-4" label={`One fewer ${line.name}`} />
        </button>
        <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
        <button
          type="button"
          onClick={() => onQuantity(line.quantity + 1)}
          disabled={line.quantity >= 20}
          className="flex size-9 items-center justify-center rounded-full border border-line hover:bg-subtle disabled:opacity-40"
        >
          <Icon name="plus" className="size-4" label={`One more ${line.name}`} />
        </button>
      </div>
    </li>
  );
}

/**
 * "Scan → use": a place's menu with a cart and checkout, at a table (from a table QR code) or for
 * pickup at the counter. Everything shown as a price is re-priced by the server when ordering.
 */
export function OrderingView({
  placeSlug,
  qrToken,
  tableLabel,
  extra,
}: {
  placeSlug: string;
  qrToken?: string;
  tableLabel?: string;
  /** More actions for this place (table requests, offers), shown above the menu. */
  extra?: (services: PlaceServices) => ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { status } = useSession();
  const [data, setData] = useState<PlaceServices | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [checkout, setCheckout] = useState(false);
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('PAY_AT_COUNTER');
  const [offerId, setOfferId] = useState('');
  const [placing, setPlacing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const cart = useCart(data?.placeId ?? null);

  const retry = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    servicesService
      .placeServices(placeSlug, controller.signal)
      .then((result) => {
        setData(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load the menu.' },
        );
      });
    return () => controller.abort();
  }, [placeSlug, reload]);

  useEffect(() => {
    void ordersService.recordView(placeSlug);
  }, [placeSlug]);

  if (error)
    return <ErrorState message={error.message} requestId={error.requestId} onRetry={retry} />;
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const food = data.services.find((service) => service.kind === 'FOOD_ORDER');
  const config = food?.config as FoodOrderConfig | undefined;
  const sections = food ? (data.catalog[food.key] ?? []) : [];
  const atTable = Boolean(qrToken);
  const orderingOpen =
    !!config && config.acceptingOrders && (atTable ? config.tableOrdering : config.pickupOrdering);

  async function placeOrder() {
    if (!data) return;
    setPlacing(true);
    setProblem(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const result = await ordersService.placeFoodOrder({
        placeId: data.placeId,
        ...(qrToken ? { qrToken } : {}),
        items: cart.lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          options: line.options.map((option) => option.name),
        })),
        ...(note.trim() ? { note: note.trim() } : {}),
        paymentMethod: payment,
        ...(offerId ? { offerId } : {}),
        idempotencyKey: idempotencyKey.current,
      });
      cart.clear();
      idempotencyKey.current = null;
      toast.show(`Order ${result.data.code} placed`);
      router.push(ROUTES.order(result.data.id));
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const fields = caught.details?.fields as Record<string, string[]> | undefined;
        setProblem(fields ? Object.values(fields).flat().join(' ') : caught.message);
        // A refused order may be retried with changes: those need a fresh key.
        if (caught.status < 500) idempotencyKey.current = null;
      } else setProblem('Could not reach CampusPin. Check your connection and try again.');
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-accent-700">
            {atTable ? 'Order from your table' : 'Order for pickup'}
          </p>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{data.name}</h1>
        </div>
        {tableLabel && (
          <span className="rounded-full bg-primary-800 px-4 py-1.5 text-sm font-semibold text-white">
            {tableLabel}
          </span>
        )}
      </div>

      {extra?.(data)}

      {!food ? (
        <EmptyState
          title={`${data.name} doesn't take orders on CampusPin yet`}
          description="You can still see its details and reviews."
          action={
            <Link
              href={ROUTES.placeDetail(data.slug)}
              className="text-sm font-semibold text-primary-700"
            >
              View {data.name}
            </Link>
          }
        />
      ) : (
        <>
          {!orderingOpen && (
            <p role="status" className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-600">
              {!config?.acceptingOrders
                ? `${data.name} has paused orders for a while. You can still look at the menu.`
                : atTable
                  ? 'Ordering from the table is off here. Order at the counter.'
                  : 'Scan the QR code on your table to order here.'}
            </p>
          )}
          {sections.length === 0 ? (
            <EmptyState
              title="The menu is being updated"
              description="Check back in a little while."
            />
          ) : (
            <div className="flex flex-col gap-4">
              <nav aria-label="Menu sections" className="flex gap-2 overflow-x-auto">
                {sections.map((section) => (
                  <a
                    key={section.name || 'menu'}
                    href={`#section-${encodeURIComponent(section.name || 'menu')}`}
                    className="shrink-0 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-medium text-ink hover:bg-subtle"
                  >
                    {section.name || 'Menu'}
                  </a>
                ))}
              </nav>
              {sections.map((section) => (
                <Card
                  key={section.name || 'menu'}
                  className="px-5"
                  id={`section-${encodeURIComponent(section.name || 'menu')}`}
                >
                  <h2 className="pt-4 text-lg font-semibold text-ink">{section.name || 'Menu'}</h2>
                  <ul className="divide-y divide-line">
                    {section.items.map((item) => (
                      <MenuItemRow
                        key={item.id}
                        item={item}
                        inCart={cart.countOf(item.id)}
                        canAdd={orderingOpen}
                        onAdd={(options) => {
                          cart.add(item, options);
                          toast.show(`${item.name} added`);
                        }}
                      />
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {cart.count > 0 && orderingOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {checkout && (
              <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink">Your order</p>
                  <button
                    type="button"
                    onClick={() => setCheckout(false)}
                    className="text-sm text-muted hover:text-ink"
                  >
                    Close
                  </button>
                </div>
                <ul className="divide-y divide-line">
                  {cart.lines.map((line) => (
                    <CartLineRow
                      key={line.key}
                      line={line}
                      onQuantity={(quantity) => cart.setQuantity(line.key, quantity)}
                    />
                  ))}
                </ul>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                  Note for the kitchen <span className="font-normal text-muted">(optional)</span>
                  <input
                    value={note}
                    maxLength={300}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="e.g. Less spicy"
                    className="h-10 rounded-md border border-control px-3 font-normal"
                  />
                </label>
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="mb-1.5 text-sm font-medium text-ink">Payment</legend>
                  {(atTable
                    ? (['PAY_AT_COUNTER', 'CASH_AT_TABLE'] as const)
                    : (['PAY_AT_COUNTER'] as const)
                  ).map((method) => (
                    <label
                      key={method}
                      className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${
                        payment === method
                          ? 'border-primary-700 bg-primary-50 text-primary-800'
                          : 'border-line text-body'
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        className="sr-only"
                        checked={payment === method}
                        onChange={() => setPayment(method)}
                      />
                      {PAYMENT_LABELS[method]}
                    </label>
                  ))}
                </fieldset>
                {data.offers.some((offer) => offer.discountType !== 'FREEBIE') && (
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                    Student offer
                    <select
                      value={offerId}
                      onChange={(event) => setOfferId(event.target.value)}
                      className="h-10 rounded-md border border-control bg-surface px-3 font-normal"
                    >
                      <option value="">No offer</option>
                      {data.offers
                        .filter((offer) => offer.discountType !== 'FREEBIE')
                        .map((offer) => (
                          <option
                            key={offer.id}
                            value={offer.id}
                            disabled={
                              offer.minOrderAmount !== null && cart.subtotal < offer.minOrderAmount
                            }
                          >
                            {offer.title}
                            {offer.minOrderAmount ? ` (min. ₹${offer.minOrderAmount})` : ''}
                          </option>
                        ))}
                    </select>
                    <span className="text-xs font-normal text-muted">
                      The discount is worked out when you place the order.
                    </span>
                  </label>
                )}
                <p className="text-xs text-muted">
                  No online payment: you pay the business directly.
                </p>
                {problem && (
                  <p role="alert" className="text-sm text-danger-700">
                    {problem}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-body">
                  {cart.count} {cart.count === 1 ? 'item' : 'items'}
                </p>
                <p className="text-lg font-bold text-ink">{rupees(cart.subtotal)}</p>
              </div>
              {!checkout ? (
                <Button onClick={() => setCheckout(true)}>
                  View order <Icon name="arrowRight" className="size-4" />
                </Button>
              ) : status === 'authenticated' ? (
                <Button loading={placing} onClick={() => void placeOrder()}>
                  Place order
                </Button>
              ) : (
                <Link
                  href={`${ROUTES.login}?next=${encodeURIComponent(pathname)}`}
                  className="inline-flex h-11 items-center rounded-md bg-action px-5 text-sm font-medium text-white"
                >
                  Sign in to order
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
