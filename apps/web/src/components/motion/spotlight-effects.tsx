'use client';

import { useEffect } from 'react';

/**
 * Feeds the cursor position to whichever `data-spotlight` card is under it (as --spot-x and
 * --spot-y), so its light and glowing border follow the mouse. One listener for the whole site,
 * mounted in the root layout; the look itself is CSS (globals.css).
 */
export function SpotlightEffects() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const paint = () => {
      frame = 0;
      if (!last || !(last.target instanceof Element)) return;
      const card = last.target.closest<HTMLElement>('[data-spotlight]');
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty('--spot-x', `${last.clientX - box.left}px`);
      card.style.setProperty('--spot-y', `${last.clientY - box.top}px`);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      last = event;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
