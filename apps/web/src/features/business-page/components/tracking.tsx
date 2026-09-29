'use client';

import type { BusinessEventType } from '@platform/contracts';
import { useEffect, type ReactNode } from 'react';
import { businessPagesService } from '@/services/business.service';

/**
 * Counts one page view per browser tab session and business, so a reload or a back-and-forth does
 * not inflate the owner's numbers. Nothing identifying is sent (see `POST /businesses/:slug/events`).
 */
export function PageViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `cp:viewed:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage blocked (private mode): still count, at worst once per load.
    }
    void businessPagesService.track(slug, 'PAGE_VIEW');
  }, [slug]);
  return null;
}

/**
 * A link that also counts a tap for the business (call, WhatsApp, directions). Without a `slug`
 * (a place with no live business page) it is a plain link.
 */
export function TrackedLink({
  href,
  slug,
  type,
  placeId,
  external = false,
  className,
  children,
  ariaLabel,
}: {
  href: string;
  slug: string | null;
  type: BusinessEventType;
  placeId?: string;
  external?: boolean;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <a
      href={href}
      aria-label={ariaLabel}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={() => {
        if (slug) void businessPagesService.track(slug, type, placeId);
      }}
      className={className}
    >
      {children}
    </a>
  );
}
