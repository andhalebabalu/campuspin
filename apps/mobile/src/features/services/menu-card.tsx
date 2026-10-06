import type { DailyMenu, MessMenuCard as MessMenuCardData } from '@platform/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card, Icon, Segmented } from '@/components/ui';
import { useSavedPlaces } from '@/hooks/use-saved-places';
import { colors, space } from '@/theme/tokens';
import { distanceLabel, mealLines } from './meta';

/** The dishes of one day, one block per meal. */
export function MealLines({ menu }: { menu: DailyMenu }) {
  return (
    <View style={styles.meals}>
      {mealLines(menu.meals).map((line) => (
        <View key={line.label}>
          <AppText variant="caption" color={colors.muted}>
            {line.label.toUpperCase()}
          </AppText>
          <AppText color={colors.ink}>{line.dishes}</AppText>
        </View>
      ))}
      {menu.note ? (
        <AppText variant="small" style={styles.note}>
          {menu.note}
        </AppText>
      ) : null}
    </View>
  );
}

/** A mess with today's menu, tomorrow's behind a switch when it is out. */
export function MessMenuCard({ card, width }: { card: MessMenuCardData; width?: number }) {
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const saved = useSavedPlaces();
  const menu = day === 'today' ? card.today : card.tomorrow;
  const distance = distanceLabel(card.place.distanceMeters);
  const isSaved = saved.isSaved(card.place.id);

  return (
    <Card style={[styles.card, width ? { width } : null]}>
      <View style={styles.head}>
        <Pressable
          style={styles.flex}
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/place/[slug]', params: { slug: card.place.slug } })}
        >
          <AppText variant="subheading" numberOfLines={1}>
            🍱 {card.place.name}
          </AppText>
          <View style={styles.meta}>
            {card.place.ratingCount > 0 ? (
              <View style={styles.metaItem}>
                <Icon name="star" size={13} color="#f59e0b" />
                <AppText variant="smallStrong" color={colors.ink}>
                  {card.place.ratingAverage.toFixed(1)}
                </AppText>
              </View>
            ) : null}
            {distance ? (
              <View style={styles.metaItem}>
                <Icon name="location-outline" size={13} color={colors.pin} />
                <AppText variant="small">{distance}</AppText>
              </View>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSaved ? 'Remove from saved' : 'Save mess'}
          hitSlop={10}
          onPress={() => saved.toggle(card.place.id)}
        >
          <Icon name={isSaved ? 'heart' : 'heart-outline'} size={24} color={isSaved ? colors.pin : colors.muted} />
        </Pressable>
      </View>
      {card.tomorrow ? (
        <Segmented
          options={[
            { value: 'today', label: 'Today' },
            { value: 'tomorrow', label: 'Tomorrow' },
          ]}
          value={day}
          onChange={setDay}
        />
      ) : null}
      {menu ? <MealLines menu={menu} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  meta: { flexDirection: 'row', gap: space.md, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meals: { gap: space.sm },
  note: { fontStyle: 'italic' },
});
