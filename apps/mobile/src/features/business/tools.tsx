import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Icon, type IconName } from '@/components/ui';
import { colors, radius, shadows, space, tints, type Tint } from '@/theme/tokens';

interface Tool {
  label: string;
  icon: IconName;
  tint: Tint;
  href: Href;
  badge?: number;
}

/** The business owner's daily tools, as big tap targets on the dashboard. */
export function BusinessTools({ tools }: { tools: readonly Tool[] }) {
  return (
    <View style={styles.grid}>
      {tools.map((tool) => {
        const [background, foreground] = tints[tool.tint];
        return (
          <Pressable
            key={tool.label}
            accessibilityRole="button"
            onPress={() => router.push(tool.href)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          >
            <View style={[styles.icon, { backgroundColor: background }]}>
              <Icon name={tool.icon} size={24} color={foreground} />
              {tool.badge ? (
                <View style={styles.badge}>
                  <AppText variant="caption" color={colors.surface}>
                    {tool.badge > 99 ? '99+' : tool.badge}
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="smallStrong" color={colors.ink} numberOfLines={1}>
              {tool.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    width: '30.5%',
    flexGrow: 1,
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 20,
    paddingHorizontal: 5,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.pin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
