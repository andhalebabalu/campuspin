'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';

/** Plain share links (no third-party scripts): each network's own "share this URL" address. */
export function ShareLinks({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const url = () =>
    typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString();
  const text = encodeURIComponent(title);

  const links = [
    {
      label: 'WhatsApp',
      short: 'WA',
      tone: 'bg-success-50 text-success-700',
      href: () => `https://wa.me/?text=${text}%20${encodeURIComponent(url())}`,
    },
    {
      label: 'Facebook',
      short: 'f',
      tone: 'bg-primary-50 text-primary-600',
      href: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`,
    },
    {
      label: 'X',
      short: 'X',
      tone: 'bg-subtle text-ink',
      href: () => `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url())}`,
    },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (an insecure origin, say): nothing else to do.
    }
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {links.map((link) => (
        <a
          key={link.label}
          href="#"
          onClick={(event) => {
            event.preventDefault();
            window.open(link.href(), '_blank', 'noopener,noreferrer');
          }}
          className="flex flex-col items-center gap-1.5 rounded-md py-2 text-xs text-body hover:bg-subtle"
        >
          <span
            className={`flex size-9 items-center justify-center rounded-full text-sm font-bold ${link.tone}`}
            aria-hidden="true"
          >
            {link.short}
          </span>
          {link.label}
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        className="flex flex-col items-center gap-1.5 rounded-md py-2 text-xs text-body hover:bg-subtle"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-accent-50 text-accent-700">
          <Icon name={copied ? 'check' : 'link'} className="size-4" />
        </span>
        <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
      </button>
    </div>
  );
}
