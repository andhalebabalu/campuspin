'use client';

import { useLayoutEffect } from 'react';

const SELECTOR = '[data-reveal]';

/**
 * Eases `data-reveal` elements in as they scroll into view, on every page (mounted once in the
 * root layout). Server components only add the attribute; this one observer does the rest, and
 * also picks up elements that appear later (a list loaded after a filter change).
 *
 * No flash on load: whatever is already on screen is marked revealed BEFORE the page switches into
 * "reveal" mode, so only content below the fold starts hidden. With reduced motion the CSS never
 * hides anything (see globals.css).
 */
export function ScrollReveal() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const reveal = (element: Element) => element.classList.add('is-revealed');

    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll(SELECTOR).forEach(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.08 },
    );

    const track = (element: Element) => {
      if (!element.classList.contains('is-revealed')) observer.observe(element);
    };

    // First paint: on-screen content stays visible; the rest waits for its turn.
    const viewport = window.innerHeight;
    document.querySelectorAll(SELECTOR).forEach((element) => {
      const box = element.getBoundingClientRect();
      if (box.top < viewport && box.bottom > 0) reveal(element);
      else track(element);
    });
    root.classList.add('reveal-ready');

    // Content added later (client navigation, lists loaded on demand).
    const mutations = new MutationObserver((records) => {
      for (const record of records)
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(SELECTOR)) track(node);
          node.querySelectorAll(SELECTOR).forEach(track);
        });
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return null;
}
