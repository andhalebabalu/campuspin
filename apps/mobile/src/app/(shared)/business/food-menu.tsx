import type { ItemOption, ServiceItem } from '@platform/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Screen,
  Sheet,
  TextField,
  useToast,
} from '@/components/ui';
import { PlaceSwitcher, usePlaceSelection } from '@/features/business/place-switcher';
import { rupees } from '@/features/orders/cart';
import { errorMessage, serverFieldErrors } from '@/lib/errors';
import { ordersService } from '@/services/orders.service';
import { colors, space } from '@/theme/tokens';

interface Draft {
  id: string | null;
  section: string;
  name: string;
  price: string;
  isVeg: boolean | null;
  options: string;
}
const EMPTY: Draft = { id: null, section: '', name: '', price: '', isVeg: null, options: '' };

const optionsText = (options: ItemOption[]) => options.map((option) => `${option.name}: ${option.price}`).join(', ');
const parseOptions = (text: string): ItemOption[] =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name = '', price = '0'] = part.split(':');
      return { name: name.trim(), price: Math.max(0, Math.round(Number(price.trim()) || 0)) };
    })
    .filter((option) => option.name);

function groups(items: ServiceItem[]): { name: string; items: ServiceItem[] }[] {
  const map = new Map<string, ServiceItem[]>();
  for (const item of items) map.set(item.section, [...(map.get(item.section) ?? []), item]);
  return [...map].map(([name, list]) => ({ name, items: list }));
}

/** The food menu students order from: sections, dishes, prices, veg marks, add-ons, sold out. */
export default function FoodMenuScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const selection = usePlaceSelection();
  const placeId = selection.place?.id;
  const key = ['business', 'items', placeId];
  const [draft, setDraft] = useState<Draft | null>(null);

  const items = useQuery({
    queryKey: key,
    enabled: !!placeId,
    queryFn: ({ signal }) => ordersService.items(placeId!, 'ORDER_FOOD', signal).then((r) => r.data),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      const body = {
        section: value.section.trim(),
        name: value.name.trim(),
        price: Math.round(Number(value.price)),
        isVeg: value.isVeg,
        options: parseOptions(value.options),
      };
      return value.id
        ? ordersService.updateItem(placeId!, value.id, body)
        : ordersService.addItem(placeId!, { ...body, serviceKey: 'ORDER_FOOD', available: true, sortOrder: items.data?.length ?? 0 });
    },
    onSuccess: (_result, value) => {
      refresh();
      toast(value.id ? 'Item updated' : 'Item added');
      setDraft(value.id ? null : { ...EMPTY, section: value.section });
    },
  });
  const toggle = useMutation({
    mutationFn: (item: ServiceItem) => ordersService.updateItem(placeId!, item.id, { available: !item.available }),
    onSuccess: refresh,
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const remove = useMutation({
    mutationFn: (item: ServiceItem) => ordersService.deleteItem(placeId!, item.id),
    onSuccess: () => {
      refresh();
      toast('Item deleted');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const sections = [...new Set((items.data ?? []).map((item) => item.section).filter(Boolean))];

  return (
    <Screen refreshing={items.isRefetching} onRefresh={() => void items.refetch()}>
      <Stack.Screen options={{ title: 'Food menu' }} />
      <View style={styles.gap}>
        <AppText>What students order at their table or for pickup. CampusPin checks every price on each order.</AppText>
        <PlaceSwitcher {...selection} />
        <Button title="Add item" icon="add" onPress={() => setDraft({ ...EMPTY })} disabled={!placeId} />
        {!placeId && !selection.listings.isPending ? (
          <EmptyState icon="storefront-outline" title="Add a listing first" />
        ) : items.isPending ? (
          <ListSkeleton />
        ) : items.isError ? (
          <ErrorState error={items.error} onRetry={() => void items.refetch()} />
        ) : items.data.length === 0 ? (
          <EmptyState icon="restaurant-outline" title="Your menu is empty" message="Add your dishes with prices." />
        ) : (
          groups(items.data).map((section) => (
            <Card key={section.name || 'menu'} style={styles.gap}>
              <AppText variant="heading">{section.name || 'Menu'}</AppText>
              {section.items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <View style={[styles.flex, !item.available && styles.dim]}>
                    <AppText variant="bodyStrong" color={colors.ink}>
                      {item.name}
                      {item.available ? '' : ' (sold out)'}
                    </AppText>
                    <AppText variant="small">
                      {rupees(item.price)}
                      {item.options.length ? ` · ${optionsText(item.options)}` : ''}
                    </AppText>
                  </View>
                  <Switch
                    value={item.available}
                    onValueChange={() => toggle.mutate(item)}
                    trackColor={{ true: colors.go }}
                    accessibilityLabel={`${item.name} available`}
                  />
                  <Button
                    title="Edit"
                    size="sm"
                    variant="ghost"
                    fullWidth={false}
                    onPress={() =>
                      setDraft({
                        id: item.id,
                        section: item.section,
                        name: item.name,
                        price: String(item.price),
                        isVeg: item.isVeg,
                        options: optionsText(item.options),
                      })
                    }
                  />
                </View>
              ))}
            </Card>
          ))
        )}
      </View>

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit item' : 'New item'}>
        {draft ? (
          <View style={styles.gap}>
            <TextField label="Section" value={draft.section} placeholder="e.g. Breakfast" maxLength={60} onChangeText={(section) => setDraft({ ...draft, section })} />
            {sections.length > 0 ? (
              <View style={styles.wrap}>
                {sections.map((name) => (
                  <Chip key={name} label={name} selected={draft.section === name} onPress={() => setDraft({ ...draft, section: name })} />
                ))}
              </View>
            ) : null}
            <TextField label="Dish" value={draft.name} maxLength={100} onChangeText={(name) => setDraft({ ...draft, name })} />
            <TextField label="Price (₹)" value={draft.price} keyboardType="number-pad" onChangeText={(price) => setDraft({ ...draft, price: price.replace(/\D/g, '') })} />
            <View style={styles.wrap}>
              <Chip label="Veg" selected={draft.isVeg === true} onPress={() => setDraft({ ...draft, isVeg: draft.isVeg === true ? null : true })} />
              <Chip label="Non-veg" selected={draft.isVeg === false} onPress={() => setDraft({ ...draft, isVeg: draft.isVeg === false ? null : false })} />
            </View>
            <TextField
              label="Add-ons (optional)"
              value={draft.options}
              placeholder="Extra cheese: 20, Jalapeno: 15"
              onChangeText={(options) => setDraft({ ...draft, options })}
            />
            {save.isError ? (
              <AppText variant="small" color={colors.danger}>
                {Object.values(serverFieldErrors(save.error)).join(' ') || errorMessage(save.error)}
              </AppText>
            ) : null}
            <Button title={draft.id ? 'Save' : 'Add to menu'} variant="success" loading={save.isPending} disabled={!draft.name.trim() || !draft.price} onPress={() => save.mutate(draft)} />
            {draft.id ? (
              <Button
                title="Delete item"
                variant="ghost"
                icon="trash-outline"
                onPress={() =>
                  Alert.alert(`Delete ${draft.name}?`, 'Past orders keep it.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        const item = items.data?.find((row) => row.id === draft.id);
                        if (item) remove.mutate(item);
                        setDraft(null);
                      },
                    },
                  ])
                }
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  dim: { opacity: 0.5 },
});
