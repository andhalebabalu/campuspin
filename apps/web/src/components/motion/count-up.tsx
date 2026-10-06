'use client';

import { useEffect, useRef, useState } from 'react';

const format = (value: number) => value.toLocaleString('en-IN');

/**
 * A number that counts up from zero the first time it is seen. The server renders the real value
 * (so it is right without JavaScript and for search engines); reduced motion keeps it still.
 */
export function CountUp({ value, durationMs = 1400 }: { value: number; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const element = ref.current;
    if (!element || value <= 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const run = () => {
      const started = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / durationMs);
        const eased = 1 - (1 - progress) ** 3;
        setShown(Math.round(value * eased));
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        run();
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className="tabular-nums">
      {format(shown)}
    </span>
  );
}
