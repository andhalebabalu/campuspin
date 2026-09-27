import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';

/**
 * Light status bar text while this screen is focused (screens with a dark gradient on top), dark
 * again when it loses focus. A `<StatusBar>` element would not work here: tab screens stay mounted,
 * so the last one rendered would win.
 */
export function useLightStatusBar(): void {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );
}
