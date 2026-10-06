import {
  MEAL_LABELS,
  MEAL_SLOTS,
  MENU_ITEMS_PER_MEAL_MAX,
  type MealSlot,
  type Meals,
  type OwnerDailyMenu,
} from '@platform/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingView,
  Screen,
  Segmented,
  TextField,
  useToast,
} from '@/components/ui';
import { PlaceSwitcher, usePlaceSelection } from '@/features/business/place-switcher';
import { dayLabel, indiaDate, shiftDate } from '@/features/services/meta';
import { errorMessage } from '@/lib/errors';
import { servicesService } from '@/services/services.service';
import { colors, radius, space } from '@/theme/tokens';

const EMPTY: Meals = { BREAKFAST: [], LUNCH: [], SNACKS: [], DINNER: [] };
type Day = 'yesterday' | 'today' | 'tomorrow';

function StatusBadge({ menu }: { menu: OwnerDailyMenu | undefined }) {
  if (!menu) return <Badge label="Not started" />;
  if (menu.status === 'PUBLISHED') return <Badge label="Published" tint="green" icon="checkmark-circle" />;
  if (menu.status === 'REMOVED') return <Badge label="Removed by CampusPin" tint="rose" />;
  return <Badge label="Draft" tint="amber" />;
}

function MealEditor({
  meal,
  dishes,
  onChange,
}: {
  meal: MealSlot;
  dishes: string[];
  onChange: (dishes: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const full = dishes.length >= MENU_ITEMS_PER_MEAL_MAX;
  const add = () => {
    const names = draft
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    const known = new Set(dishes.map((dish) => dish.toLowerCase()));
    onChange([...dishes, ...names.filter((name) => !known.has(name.toLowerCase()))].slice(0, MENU_ITEMS_PER_MEAL_MAX));
    setDraft('');
  };
  return (
    <Card style={styles.gap}>
      <AppText variant="subheading">{MEAL_LABELS[meal]}</AppText>
      {dishes.length > 0 ? (
        <View style={styles.dishes}>
          {dishes.map((dish, index) => (
            <Pressable
              key={`${dish}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${dish}`}
              onPress={() => onChange(dishes.filter((_, at) => at !== index))}
              style={styles.dish}
            >
              <AppText variant="smallStrong" color={colors.ink}>
                {dish}
              </AppText>
              <Icon name="close" size={14} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : (
        <AppText variant="small">No dishes yet.</AppText>
      )}
      <View style={styles.addRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          editable={!full}
          maxLength={200}
          returnKeyType="done"
          placeholder={full ? 'This meal is full' : 'Add item, e.g. Dal, Rice'}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
        />
        <Button title="Add" icon="add" size="sm" variant="secondary" fullWidth={false} disabled={full || !draft.trim()} onPress={add} />
      </View>
    </Card>
  );
}

/**
 * The mess owner's daily menu, made for a phone: pick the day, tap to add dishes per meal, publish.
 * Copying yesterday's menu (or today's to tomorrow) is one tap, because most days change little.
 */
export default function BusinessMenuScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const selection = usePlaceSelection();
  const placeId = selection.place?.id;
  const today = indiaDate();
  const [day, setDay] = useState<Day>('today');
  const date = day === 'today' ? today : shiftDate(today, day === 'tomorrow' ? 1 : -1);

  const menus = useQuery({
    queryKey: ['business', 'menus', placeId],
    enabled: !!placeId,
    queryFn: ({ signal }) =>
      servicesService
        .ownerMenus(placeId!, { from: shiftDate(today, -7), to: shiftDate(today, 7) }, signal)
        .then((r) => r.data),
  });
  const current = menus.data?.find((menu) => menu.date === date);

  // Unsaved edits belong to one day's saved version; switching day starts from what is stored.
  const editKey = `${placeId}|${date}|${current?.updatedAt ?? 'new'}`;
  const [draft, setDraft] = useState<{ key: string; meals: Meals; note: string } | null>(null);
  const meals = draft?.key === editKey ? draft.meals : (current?.meals ?? EMPTY);
  const note = draft?.key === editKey ? draft.note : (current?.note ?? '');
  const dishCount = MEAL_SLOTS.reduce((sum, meal) => sum + meals[meal].length, 0);

  const store = (saved: OwnerDailyMenu | null, removedDate?: string) =>
    queryClient.setQueryData<OwnerDailyMenu[]>(['business', 'menus', placeId], (list) => {
      const rest = (list ?? []).filter((menu) => menu.date !== (saved?.date ?? removedDate));
      return saved ? [saved, ...rest] : rest;
    });

  const action = useMutation({
    mutationFn: async (kind: 'publish' | 'save' | 'unpublish' | 'copy' | 'copy-next' | 'delete') => {
      if (!placeId) throw new Error('Choose a listing first');
      if (kind === 'publish' || kind === 'save') {
        return (await servicesService.saveMenu(placeId, date, { meals, note: note.trim() || null, publish: kind === 'publish' })).data;
      }
      if (kind === 'unpublish') return (await servicesService.unpublishMenu(placeId, date)).data;
      if (kind === 'copy') return (await servicesService.copyMenu(placeId, date, shiftDate(date, -1))).data;
      if (kind === 'copy-next') return (await servicesService.copyMenu(placeId, shiftDate(date, 1), date)).data;
      await servicesService.deleteMenu(placeId, date);
      return null;
    },
    onSuccess: (saved, kind) => {
      store(saved, date);
      const messages = {
        publish: `${dayLabel(date)} menu published`,
        save: current?.status === 'PUBLISHED' ? 'Changes published' : 'Draft saved',
        unpublish: 'Menu hidden from students',
        copy: 'Copied the previous day’s menu',
        'copy-next': 'Copied to the next day. Open it to publish.',
        delete: 'Menu deleted',
      } as const;
      toast(messages[kind]);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const confirm = (title: string, run: () => void) =>
    Alert.alert(title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', onPress: run },
    ]);

  if (selection.listings.isPending) return <LoadingView />;
  if (selection.listings.isError) {
    return <ErrorState error={selection.listings.error} onRetry={() => void selection.listings.refetch()} />;
  }
  if (!selection.place) {
    return (
      <EmptyState icon="restaurant-outline" title="Add your mess first" message="Menus belong to one of your listings." />
    );
  }

  const busy = action.isPending ? action.variables : null;

  return (
    <Screen
      keyboard
      footer={
        current?.status === 'PUBLISHED' ? (
          <View style={styles.footerRow}>
            <Button title="Unpublish" variant="secondary" fullWidth={false} loading={busy === 'unpublish'} onPress={() => action.mutate('unpublish')} />
            <View style={styles.flex}>
              <Button title="Publish changes" variant="success" loading={busy === 'save'} disabled={dishCount === 0} onPress={() => action.mutate('save')} />
            </View>
          </View>
        ) : (
          <View style={styles.footerRow}>
            <Button title="Save draft" variant="secondary" fullWidth={false} loading={busy === 'save'} disabled={dishCount === 0} onPress={() => action.mutate('save')} />
            <View style={styles.flex}>
              <Button
                title={`Publish ${day === 'today' ? 'today’s' : day === 'tomorrow' ? 'tomorrow’s' : 'this'} menu`}
                variant="success"
                icon="send"
                loading={busy === 'publish'}
                disabled={dishCount === 0}
                onPress={() => action.mutate('publish')}
              />
            </View>
          </View>
        )
      }
    >
      <Stack.Screen options={{ title: 'Daily menu' }} />
      <View style={styles.gap}>
        <PlaceSwitcher {...selection} />
        <Segmented
          options={[
            { value: 'yesterday', label: 'Yesterday' },
            { value: 'today', label: 'Today' },
            { value: 'tomorrow', label: 'Tomorrow' },
          ]}
          value={day}
          onChange={setDay}
          tone="brand"
        />
        <View style={styles.statusRow}>
          <AppText variant="bodyStrong" color={colors.ink}>
            {dayLabel(date)}
          </AppText>
          <StatusBadge menu={current} />
        </View>
        {selection.place.status !== 'ACTIVE' ? (
          <AppText variant="small" color={colors.warning}>
            {selection.place.name} is not live yet: students see your menu once it is approved.
          </AppText>
        ) : null}
        {current?.status === 'REMOVED' ? (
          <AppText variant="small" color={colors.danger}>
            The CampusPin team took this menu down{current.removedReason ? `: ${current.removedReason}` : '.'} Edit it and publish again.
          </AppText>
        ) : null}

        {menus.isPending ? (
          <LoadingView />
        ) : menus.isError ? (
          <ErrorState error={menus.error} onRetry={() => void menus.refetch()} />
        ) : (
          <>
            <View style={styles.copyRow}>
              <Button
                title={day === 'today' ? 'Copy yesterday’s' : 'Copy previous day'}
                icon="copy-outline"
                variant="outline"
                size="sm"
                fullWidth={false}
                loading={busy === 'copy'}
                onPress={() =>
                  dishCount > 0 ? confirm('Replace these dishes with the previous day’s?', () => action.mutate('copy')) : action.mutate('copy')
                }
              />
              {current ? (
                <Button
                  title={day === 'today' ? 'Copy to tomorrow' : 'Copy to next day'}
                  icon="arrow-forward"
                  variant="outline"
                  size="sm"
                  fullWidth={false}
                  loading={busy === 'copy-next'}
                  onPress={() => action.mutate('copy-next')}
                />
              ) : null}
            </View>
            {MEAL_SLOTS.map((meal) => (
              <MealEditor
                key={`${editKey}-${meal}`}
                meal={meal}
                dishes={meals[meal]}
                onChange={(dishes) => setDraft({ key: editKey, meals: { ...meals, [meal]: dishes }, note })}
              />
            ))}
            <TextField
              label="Note for students (optional)"
              value={note}
              maxLength={255}
              placeholder="e.g. Special: Gulab jamun at dinner"
              onChangeText={(value) => setDraft({ key: editKey, meals, note: value })}
            />
            {current ? (
              <Button
                title="Delete this menu"
                icon="trash-outline"
                variant="ghost"
                loading={busy === 'delete'}
                onPress={() => confirm(`Delete the menu for ${dayLabel(date)}?`, () => action.mutate('delete'))}
              />
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  copyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dishes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dish: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.subtle,
    borderWidth: 1,
    borderColor: colors.line,
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  footerRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
});
