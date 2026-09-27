import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, space } from '@/theme/tokens';
import { Icon } from './icon';
import { AppText } from './text';

type Tone = 'success' | 'error' | 'info';

const ToastContext = createContext<((message: string, tone?: Tone) => void) | null>(null);

const ICON = { success: 'checkmark-circle', error: 'alert-circle', info: 'information-circle' } as const;
const ICON_COLOR = { success: '#4ade80', error: '#f87171', info: '#93c5fd' } as const;

/** A short message that slides in at the top, e.g. "Listing published". */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; tone: Tone } | null>(null);
  const [translate] = useState(() => new Animated.Value(-120));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, tone: Tone = 'success') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, tone });
      void Haptics.notificationAsync(
        tone === 'error'
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      Animated.spring(translate, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
      timer.current = setTimeout(() => {
        Animated.timing(translate, { toValue: -120, duration: 220, useNativeDriver: true }).start(
          () => setToast(null),
        );
      }, 2600);
    },
    [translate],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { top: insets.top + space.sm, transform: [{ translateY: translate }] }]}
        >
          <View style={styles.toast}>
            <Icon name={ICON[toast.tone]} size={20} color={ICON_COLOR[toast.tone]} />
            <AppText variant="smallStrong" color={colors.surface} style={styles.text}>
              {toast.message}
            </AppText>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used within a ToastProvider');
  return show;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    maxWidth: 480,
    ...shadows.lg,
  },
  text: { flexShrink: 1 },
});
