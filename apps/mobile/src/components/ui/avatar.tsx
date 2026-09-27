import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { initials } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { colors, palette } from '@/theme/tokens';
import { Icon } from './icon';
import { AppText } from './text';

const BACKGROUNDS = [
  [palette.primary100, palette.primary700],
  [palette.accent50, palette.accent700],
  [palette.violet50, palette.violet600],
  [palette.amber50, palette.amber600],
  [palette.rose50, palette.rose600],
  [palette.teal50, palette.teal600],
] as const;

/** The same name always gets the same colour. */
function colorsFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BACKGROUNDS[hash % BACKGROUNDS.length] ?? BACKGROUNDS[0];
}

export function Avatar({
  name,
  imageUrl,
  size = 40,
  verified = false,
}: {
  name: string;
  imageUrl?: string | null;
  size?: number;
  /** Shows the green verified-student tick on the avatar. */
  verified?: boolean;
}) {
  const [background, foreground] = colorsFor(name);
  const uri = mediaUrl(imageUrl);
  const tick = Math.max(14, Math.round(size * 0.36));

  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View
          style={[
            styles.circle,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
          ]}
        >
          <AppText
            style={{ fontSize: size * 0.38, lineHeight: size * 0.46 }}
            variant="bodyStrong"
            color={foreground}
          >
            {initials(name) || '?'}
          </AppText>
        </View>
      )}
      {verified ? (
        <View
          style={[
            styles.tick,
            { width: tick, height: tick, borderRadius: tick / 2, right: -2, bottom: -2 },
          ]}
        >
          <Icon name="checkmark" size={tick * 0.7} color={colors.surface} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  tick: {
    position: 'absolute',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
