import { PROMOTION_KIND_LABELS, type Promotion } from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, Icon } from '@/components/ui';
import { openLink } from '@/lib/links';
import { mediaUrl } from '@/lib/media';
import { promotionsService } from '@/services/promotions.service';
import { colors, heroGradient, radius, space } from '@/theme/tokens';

/** One splash ad per app launch, however often the tabs re-mount. */
let shownThisLaunch = false;

/**
 * The full-screen ad staff set in the admin panel: shown once when the app opens, for
 * `displaySeconds`, with a close button after `skipAfterSeconds`. Renders nothing when there is
 * no live splash ad for this member.
 */
export function SplashAd() {
  const [dismissed, setDismissed] = useState(shownThisLaunch);
  const query = useQuery({
    queryKey: ['promotions', 'SPLASH'],
    queryFn: ({ signal }) => promotionsService.live('SPLASH', signal).then((r) => r.data),
    enabled: !dismissed,
    staleTime: Infinity,
    retry: false,
  });
  const ad = query.data?.[0];
  if (dismissed || !ad) return null;
  return (
    <AdView
      ad={ad}
      onClose={() => {
        shownThisLaunch = true;
        setDismissed(true);
      }}
    />
  );
}

function AdView({ ad, onClose }: { ad: Promotion; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [elapsed, setElapsed] = useState(0);
  const [progress] = useState(() => new Animated.Value(0));
  const closed = useRef(false);
  const canClose = elapsed >= ad.skipAfterSeconds;
  const image = mediaUrl(ad.imageUrl);

  function close() {
    if (closed.current) return;
    closed.current = true;
    onClose();
  }

  useEffect(() => {
    shownThisLaunch = true;
    promotionsService.record(ad.id, 'view');
    Animated.timing(progress, {
      toValue: 1,
      duration: ad.displaySeconds * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
    const timer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [ad.id, ad.displaySeconds, progress]);

  // Closes by itself once its time is up.
  useEffect(() => {
    if (elapsed >= ad.displaySeconds) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `close` is stable in effect.
  }, [elapsed, ad.displaySeconds]);

  async function openCta() {
    promotionsService.record(ad.id, 'click');
    close();
    await openLink(ad.ctaLink).catch(() => false);
  }

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const left = Math.max(0, ad.skipAfterSeconds - elapsed);

  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => canClose && close()}>
      <View style={styles.root}>
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
        ) : (
          <LinearGradient colors={heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
            <View style={[styles.blob, styles.blobGreen]} />
            <View style={[styles.blob, styles.blobPin]} />
            <View style={styles.markWrap}>
              <View style={styles.markTile}>
                <Image source={require('@/assets/images/logo-mark.png')} style={styles.mark} contentFit="contain" />
              </View>
            </View>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['rgba(3,29,64,0.55)', 'transparent', 'transparent', 'rgba(3,29,64,0.9)']}
          locations={[0, 0.22, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width }]} />
          </View>
          <View style={styles.topRow}>
            <View style={styles.kind}>
              <AppText variant="caption" color={colors.surface}>
                {PROMOTION_KIND_LABELS[ad.kind]}
              </AppText>
            </View>
            {canClose ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close ad"
                onPress={close}
                hitSlop={10}
                style={({ pressed }) => [styles.close, pressed && { opacity: 0.8 }]}
              >
                <Icon name="close" size={18} color={colors.ink} />
                <AppText variant="smallStrong" color={colors.ink}>
                  Close
                </AppText>
              </Pressable>
            ) : (
              <View style={styles.wait} accessibilityLabel={`You can close this in ${left} seconds`}>
                <AppText variant="smallStrong" color={colors.surface}>
                  Close in {left}s
                </AppText>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.xl }]}>
          <AppText variant="hero" color={colors.surface}>
            {ad.title}
          </AppText>
          {ad.body ? (
            <AppText color="rgba(255,255,255,0.88)" style={styles.body}>
              {ad.body}
            </AppText>
          ) : null}
          {ad.ctaLabel && ad.ctaLink ? (
            <Button title={ad.ctaLabel} variant="light" size="lg" iconRight="arrow-forward" onPress={() => void openCta()} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand },
  blob: { position: 'absolute', borderRadius: 999 },
  blobGreen: { width: 320, height: 320, top: -80, right: -120, backgroundColor: 'rgba(42,145,60,0.35)' },
  blobPin: { width: 260, height: 260, bottom: 120, left: -120, backgroundColor: 'rgba(234,61,36,0.25)' },
  markWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 160 },
  markTile: {
    width: 150,
    height: 150,
    borderRadius: 40,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { width: 112, height: 112 },
  top: { paddingHorizontal: space.lg, gap: space.md },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.surface },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kind: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  wait: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  close: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, gap: space.md },
  body: { fontSize: 16, lineHeight: 23 },
});
