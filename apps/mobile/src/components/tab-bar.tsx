import type { BottomTabBarProps } from 'expo-router/tabs';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Icon, type IconName } from '@/components/ui';
import { colors, fonts, shadows, space } from '@/theme/tokens';

export interface TabSpec {
  name: string;
  title: string;
  icon: IconName;
  iconActive: IconName;
}

/** A white tab bar. The active tab gets a filled navy icon, a bold navy label and a top marker. */
const noBadges = (): Record<string, number> => ({});

/** `useBadges` is a hook returning a dot count per tab name (e.g. unread messages). */
export function makeTabBar(specs: readonly TabSpec[], useBadges: () => Record<string, number> = noBadges) {
  return function TabBar({ state, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const badges = useBadges();
    return (
      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <View style={styles.bar}>
          {state.routes.map((route, index) => {
            const spec = specs.find((item) => item.name === route.name);
            if (!spec) return null;
            const focused = state.index === index;
            const badge = badges[route.name] ?? 0;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={spec.title}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    void Haptics.selectionAsync().catch(() => undefined);
                    navigation.navigate(route.name);
                  }
                }}
                style={styles.tab}
              >
                <View style={[styles.marker, focused && styles.markerActive]} />
                <View style={styles.iconWrap}>
                  <Icon
                    name={focused ? spec.iconActive : spec.icon}
                    size={22}
                    color={focused ? colors.brand : colors.muted}
                  />
                  {badge > 0 ? <View style={styles.dot} /> : null}
                </View>
                <AppText
                  variant="caption"
                  color={focused ? colors.brand : colors.muted}
                  style={focused ? styles.labelActive : undefined}
                >
                  {spec.title}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 0,
    ...shadows.md,
  },
  bar: { flexDirection: 'row', paddingHorizontal: space.sm },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  marker: { width: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, marginBottom: space.xs },
  markerActive: { backgroundColor: colors.brand },
  labelActive: { fontFamily: fonts.semibold },
  iconWrap: {
    width: 56,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 4,
    right: 14,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.pin,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
