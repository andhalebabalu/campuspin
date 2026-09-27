import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  TextInput,
  View,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

function animate(event?: KeyboardEvent) {
  if (Platform.OS !== 'ios') return;
  LayoutAnimation.configureNext({
    duration: event?.duration || 250,
    update: { type: LayoutAnimation.Types.keyboard },
  });
}

/**
 * Keeps its content (a chat's message box, a form's submit button) above the on-screen keyboard.
 *
 * Android apps run edge-to-edge, so the window no longer shrinks when the keyboard opens and
 * `KeyboardAvoidingView` without a behaviour does nothing. This measures where the view ends on the
 * screen and where the keyboard starts, and pads by the overlap. If the system did shrink the
 * window, the view already ends above the keyboard and the padding stays 0, so it never doubles up.
 */
export function KeyboardAvoider({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View>(null);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [bottom, setBottom] = useState(0);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _width, height) => setBottom(y + height));
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener(SHOW, (event) => {
      animate(event);
      setKeyboardTop(event.endCoordinates.screenY);
      measure();
    });
    const hide = Keyboard.addListener(HIDE, (event) => {
      animate(event);
      setKeyboardTop(null);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [measure]);

  const overlap = keyboardTop === null ? 0 : Math.max(0, bottom - keyboardTop);

  return (
    <View ref={ref} onLayout={measure} style={[{ flex: 1 }, style, { paddingBottom: overlap }]}>
      {children}
    </View>
  );
}

/** Whether the on-screen keyboard is open (e.g. to drop the home-indicator gap under a chat box). */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(SHOW, () => setVisible(true));
    const hide = Keyboard.addListener(HIDE, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

// Fields announce focus here, so a form can reveal a field chosen while the keyboard is already open.
const focusListeners = new Set<() => void>();

/** Called by TextField on focus. */
export function announceInputFocus(): void {
  for (const listener of focusListeners) listener();
}

/**
 * Scrolls a form so the focused field sits above the keyboard (Android does not do this for
 * edge-to-edge apps). Pass the returned handler to the ScrollView's `onScroll`.
 */
export function useRevealFocusedInput(scrollRef: React.RefObject<ScrollView | null>) {
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);

  useEffect(() => {
    const reveal = () => {
      // Wait until the avoider's padding has shrunk the scroll view.
      setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput();
        const scroll = scrollRef.current;
        if (!input || !scroll || keyboardTop.current === null) return;
        const frame = scroll.getNativeScrollRef();
        if (!frame) return;
        frame.measureInWindow((_sx, scrollY, _sw, scrollHeight) => {
          input.measureInWindow((_x, y, _w, height) => {
            const visibleBottom = Math.min(scrollY + scrollHeight, keyboardTop.current ?? Infinity);
            const hidden = y + height + 24 - visibleBottom;
            const above = scrollY + 12 - y;
            if (hidden > 0) scroll.scrollTo({ y: offset.current + hidden, animated: true });
            else if (above > 0) scroll.scrollTo({ y: Math.max(0, offset.current - above), animated: true });
          });
        });
      }, Platform.OS === 'ios' ? 320 : 120);
    };
    const show = Keyboard.addListener(SHOW, (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      reveal();
    });
    const hide = Keyboard.addListener(HIDE, () => {
      keyboardTop.current = null;
    });
    const onFocus = () => {
      if (keyboardTop.current !== null) reveal();
    };
    focusListeners.add(onFocus);
    return () => {
      show.remove();
      hide.remove();
      focusListeners.delete(onFocus);
    };
  }, [scrollRef]);

  return useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);
}
