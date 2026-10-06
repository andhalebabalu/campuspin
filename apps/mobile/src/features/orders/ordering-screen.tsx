import {
  PAYMENT_LABELS,
  type FoodOrderConfig,
  type ItemOption,
  type PaymentMethod,
  type PlaceServices,
  type ServiceItem,
} from '@platform/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingView,
  Sheet,
  useToast,
} from '@/components/ui';
import { ApiClientError } from '@platform/api-client';
import { errorMessage, serverFieldErrors } from '@/lib/errors';
import { ordersService } from '@/services/orders.service';
import { servicesService } from '@/services/services.service';
import { colors, radius, shadows, space } from '@/theme/tokens';
import { newIdempotencyKey, rupees, useCart, type CartLine } from './cart';

function VegDot({ isVeg }: { isVeg: boolean | null }) {
  if (isVeg === null) return null;
  const color = isVeg ? colors.success : colors.danger;
  return (
    <View style={[styles.veg, { borderColor: color }]}>
      <View style={[styles.vegDot, { backgroundColor: color }]} />
    </View>
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
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemHead}>
        <View style={styles.flex}>
          <View style={styles.itemName}>
            <VegDot isVeg={item.isVeg} />
            <AppText variant="bodyStrong" color={colors.ink} style={styles.flex}>
              {item.name}
            </AppText>
          </View>
          {item.description ? <AppText variant="small">{item.description}</AppText> : null}
          <AppText variant="smallStrong" color={colors.ink}>
            {rupees(item.price)}
          </AppText>
        </View>
        {canAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.name}`}
            onPress={() => (item.options.length > 0 ? setChoosing(!choosing) : onAdd([]))}
            style={({ pressed }) => [styles.addButton, inCart > 0 && styles.addButtonOn, pressed && styles.pressed]}
          >
            <Icon name="add" size={18} color={inCart > 0 ? colors.surface : colors.action} />
            <AppText variant="smallStrong" color={inCart > 0 ? colors.surface : colors.action}>
              {inCart > 0 ? `ADD · ${inCart}` : 'ADD'}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {choosing ? (
        <View style={styles.options}>
          {item.options.map((option) => {
            const on = chosen.includes(option.name);
            return (
              <Pressable
                key={option.name}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setChosen(on ? chosen.filter((name) => name !== option.name) : [...chosen, option.name])}
                style={styles.optionRow}
              >
                <Icon name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.action : colors.muted} />
                <AppText color={colors.ink} style={styles.flex}>
                  {option.name}
                </AppText>
                <AppText variant="small">+{rupees(option.price)}</AppText>
              </Pressable>
            );
          })}
          <Button
            title="Add to order"
            size="sm"
            onPress={() => {
              onAdd(item.options.filter((option) => chosen.includes(option.name)));
              setChoosing(false);
              setChosen([]);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function CartRow({ line, onQuantity }: { line: CartLine; onQuantity: (quantity: number) => void }) {
  return (
    <View style={styles.cartRow}>
      <View style={styles.flex}>
        <AppText color={colors.ink}>{line.name}</AppText>
        {line.options.length > 0 ? (
          <AppText variant="small">{line.options.map((option) => option.name).join(', ')}</AppText>
        ) : null}
        <AppText variant="smallStrong">{rupees(line.unitPrice * line.quantity)}</AppText>
      </View>
      <View style={styles.stepper}>
        <Pressable accessibilityLabel={`One fewer ${line.name}`} hitSlop={8} onPress={() => onQuantity(line.quantity - 1)} style={styles.stepButton}>
          <Icon name="remove" size={18} color={colors.action} />
        </Pressable>
        <AppText variant="bodyStrong">{line.quantity}</AppText>
        <Pressable accessibilityLabel={`One more ${line.name}`} hitSlop={8} onPress={() => onQuantity(line.quantity + 1)} style={styles.stepButton}>
          <Icon name="add" size={18} color={colors.action} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * "Scan → use": a place's menu with a cart and checkout, at a table (from a table QR code) or for
 * pickup. Prices shown are re-checked by the server, which prices the order itself.
 */
export function OrderingScreen({
  slug,
  qrToken,
  tableLabel,
  extra,
}: {
  slug: string;
  qrToken?: string;
  tableLabel?: string;
  /** Other actions at this place (table requests, offers), shown above the menu. */
  extra?: (services: PlaceServices) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [checkout, setCheckout] = useState(false);
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('PAY_AT_COUNTER');
  const [offerId, setOfferId] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  const services = useQuery({
    queryKey: ['place-services', slug],
    queryFn: ({ signal }) => servicesService.placeServices(slug, signal).then((r) => r.data),
  });
  const cart = useCart(services.data?.placeId ?? null);

  useEffect(() => {
    void ordersService.recordView(slug);
  }, [slug]);

  const place = useMutation({
    mutationFn: async () => {
      const data = services.data!;
      key.current ??= newIdempotencyKey();
      return ordersService
        .placeFoodOrder({
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
          idempotencyKey: key.current,
        })
        .then((r) => r.data);
    },
    onSuccess: (order) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      cart.clear();
      key.current = null;
      setCheckout(false);
      toast(`Order ${order.code} placed`);
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    },
    onError: (error) => {
      // A refused order can be changed and retried: that needs a fresh key.
      if (error instanceof ApiClientError && error.status < 500) key.current = null;
    },
  });

  if (services.isPending) return <LoadingView />;
  if (services.isError) return <ErrorState error={services.error} onRetry={() => void services.refetch()} />;
  const data = services.data;
  const food = data.services.find((service) => service.kind === 'FOOD_ORDER');
  const config = food?.config as FoodOrderConfig | undefined;
  const sections = food ? (data.catalog[food.key] ?? []) : [];
  const atTable = Boolean(qrToken);
  const open = !!config && config.acceptingOrders && (atTable ? config.tableOrdering : config.pickupOrdering);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <AppText variant="smallStrong" color={colors.accent}>
              {atTable ? 'Order from your table' : 'Order for pickup'}
            </AppText>
            <AppText variant="title" color={colors.brand}>
              {data.name}
            </AppText>
          </View>
          {tableLabel ? <Badge label={tableLabel} tint="blue" icon="restaurant" /> : null}
        </View>

        {extra?.(data)}

        {!food ? (
          <EmptyState
            icon="restaurant-outline"
            title="No ordering here yet"
            message={`${data.name} doesn’t take orders on CampusPin yet.`}
            actionLabel="View place"
            onAction={() => router.replace({ pathname: '/place/[slug]', params: { slug: data.slug } })}
          />
        ) : (
          <>
            {!open ? (
              <Card style={styles.notice}>
                <Icon name="pause-circle-outline" size={20} color={colors.warning} />
                <AppText variant="small" color={colors.ink} style={styles.flex}>
                  {!config?.acceptingOrders
                    ? `${data.name} has paused orders for a while. You can still look at the menu.`
                    : atTable
                      ? 'Ordering from the table is off here. Order at the counter.'
                      : 'Scan the QR code on your table to order here.'}
                </AppText>
              </Card>
            ) : null}
            {sections.length === 0 ? (
              <EmptyState icon="book-outline" title="The menu is being updated" message="Check back in a little while." />
            ) : (
              sections.map((section) => (
                <Card key={section.name || 'menu'} style={styles.section}>
                  <AppText variant="heading">{section.name || 'Menu'}</AppText>
                  {section.items.map((item) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      inCart={cart.countOf(item.id)}
                      canAdd={open}
                      onAdd={(options) => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                        cart.add(item, options);
                      }}
                    />
                  ))}
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>

      {cart.count > 0 && open ? (
        <View style={[styles.cartBar, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.flex}>
            <AppText variant="small">
              {cart.count} {cart.count === 1 ? 'item' : 'items'}
            </AppText>
            <AppText variant="heading">{rupees(cart.subtotal)}</AppText>
          </View>
          <Button title="View order" iconRight="arrow-forward" variant="success" fullWidth={false} onPress={() => setCheckout(true)} />
        </View>
      ) : null}

      <Sheet visible={checkout} onClose={() => setCheckout(false)} title="Your order">
        <View style={styles.sheet}>
          {cart.lines.map((line) => (
            <CartRow key={line.key} line={line} onQuantity={(quantity) => cart.setQuantity(line.key, quantity)} />
          ))}
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={300}
            placeholder="Note for the kitchen (optional)"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
          />
          <View style={styles.payments}>
            {(atTable ? (['PAY_AT_COUNTER', 'CASH_AT_TABLE'] as const) : (['PAY_AT_COUNTER'] as const)).map((method) => (
              <Pressable
                key={method}
                accessibilityRole="radio"
                accessibilityState={{ selected: payment === method }}
                onPress={() => setPayment(method)}
                style={[styles.payment, payment === method && styles.paymentOn]}
              >
                <AppText variant="smallStrong" color={payment === method ? colors.brand : colors.body}>
                  {PAYMENT_LABELS[method]}
                </AppText>
              </Pressable>
            ))}
          </View>
          {data.offers.filter((offer) => offer.discountType !== 'FREEBIE').length > 0 ? (
            <View style={styles.payments}>
              {data.offers
                .filter((offer) => offer.discountType !== 'FREEBIE')
                .map((offer) => {
                  const tooSmall = offer.minOrderAmount !== null && cart.subtotal < offer.minOrderAmount;
                  const on = offerId === offer.id;
                  return (
                    <Pressable
                      key={offer.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on, disabled: tooSmall }}
                      disabled={tooSmall}
                      onPress={() => setOfferId(on ? null : offer.id)}
                      style={[styles.payment, on && styles.paymentOn, tooSmall && styles.disabled]}
                    >
                      <AppText variant="smallStrong" color={on ? colors.brand : colors.body}>
                        🎁 {offer.title}
                        {offer.minOrderAmount ? ` (min. ₹${offer.minOrderAmount})` : ''}
                      </AppText>
                    </Pressable>
                  );
                })}
            </View>
          ) : null}
          <AppText variant="small">No online payment: you pay the business directly. Offer discounts are worked out when you order.</AppText>
          {place.isError ? (
            <AppText variant="small" color={colors.danger}>
              {Object.values(serverFieldErrors(place.error)).join(' ') || errorMessage(place.error)}
            </AppText>
          ) : null}
          <Button
            title={`Place order · ${rupees(cart.subtotal)}`}
            variant="success"
            loading={place.isPending}
            disabled={cart.count === 0}
            onPress={() => place.mutate()}
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.warningSoft },
  section: { gap: space.xs },
  itemRow: { paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, gap: space.sm },
  itemHead: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  itemName: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  veg: { width: 16, height: 16, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 84,
    height: 40,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.action,
    backgroundColor: colors.surface,
  },
  addButtonOn: { backgroundColor: colors.action },
  pressed: { opacity: 0.8 },
  options: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.subtle },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40 },
  cartBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    ...shadows.lg,
  },
  sheet: { gap: space.md },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink,
  },
  payments: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  payment: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  paymentOn: { borderColor: colors.brand, backgroundColor: colors.actionSoft },
  disabled: { opacity: 0.45 },
});
