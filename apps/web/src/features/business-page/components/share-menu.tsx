'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { businessPagesService } from '@/services/business.service';

interface ShareTarget {
  label: string;
  icon: IconName;
  href: (url: string, text: string) => string;
}

const TARGETS: readonly ShareTarget[] = [
  {
    label: 'WhatsApp',
    icon: 'whatsapp',
    href: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    label: 'Facebook',
    icon: 'facebook',
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    label: 'Telegram',
    icon: 'send',
    href: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
];

/**
 * Share a page: the phone's own share sheet where the browser has one (it reaches Instagram,
 * WhatsApp and everything else installed), otherwise a menu with copy-link and the common apps.
 * Each share is counted for the business when `trackSlug` is set.
 */
export function ShareMenu({
  url,
  title,
  text,
  trackSlug,
  compact = false,
  className = '',
}: {
  url: string;
  title: string;
  text: string;
  trackSlug: string | null;
  compact?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !menuRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const track = () => {
    if (trackSlug) void businessPagesService.track(trackSlug, 'SHARE_CLICK');
  };

  async function start() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        track();
      } catch {
        // Dismissed: nothing to do.
      }
      return;
    }
    setOpen((value) => !value);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.show('Link copied');
      track();
    } catch {
      toast.show('Could not copy. Select the address bar and copy it.', 'error');
    }
    setOpen(false);
  }

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => void start()}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? 'Share' : undefined}
        className={
          compact
            ? 'inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-subtle'
            : 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-subtle'
        }
      >
        <Icon name="share" className="size-4" />
        {!compact && 'Share'}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void copy()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-subtle"
          >
            <Icon name="copy" className="size-4 text-muted" /> Copy link
          </button>
          {TARGETS.map((target) => (
            <a
              key={target.label}
              role="menuitem"
              href={target.href(url, text)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                track();
                setOpen(false);
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-subtle"
            >
              <Icon name={target.icon} className="size-4 text-muted" /> {target.label}
            </a>
          ))}
          <p className="border-t border-line px-3 pt-2 pb-1 text-xs text-muted">
            Instagram: copy the link and paste it in your story or bio.
          </p>
        </div>
      )}
    </div>
  );
}
