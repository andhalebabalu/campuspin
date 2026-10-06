import type { QuickAction } from '@platform/contracts';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Icon } from '@/components/ui';
import { colors, radius, shadows, space } from '@/theme/tokens';
import { serviceIcon, tileTint } from './meta';

/**
 * The home screen's quick actions, four to a row. Each opens the places that really offer it;
 * "None nearby yet" is said plainly rather than hiding the action.
 */
export function QuickActions({ actions }: { actions: readonly QuickAction[] }) {
  return (
    <View style={styles.grid}>
      {actions.map((action, index) => {
        const [background, foreground] = tileTint(index);
        return (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={`${action.name}. ${action.available > 0 ? `${action.available} places` : 'None nearby yet'}`}
            onPress={() =>
              action.kind === 'OFFERS'
                ? router.push('/offers')
                : router.push({ pathname: '/service/[key]', params: { key: action.key } })
            }
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          >
            <View style={[styles.icon, { backgroundColor: background }]}>
              <Icon name={serviceIcon(action.icon)} size={24} color={foreground} />
            </View>
            <AppText variant="caption" color={colors.ink} align="center" numberOfLines={2}>
              {action.name}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md },
  tile: { width: '25%', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xxs },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
