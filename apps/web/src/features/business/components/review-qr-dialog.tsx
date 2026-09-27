'use client';

import type { BusinessListing } from '@platform/contracts';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';
import { ROUTES } from '@/constants/routes';
import { env } from '@/lib/env';

// Error correction "M" survives a scuffed or partly covered print while keeping the code sparse
// enough to scan from a phone at arm's length.
const QR_OPTIONS = { errorCorrectionLevel: 'M', margin: 2 } as const;

/** The absolute link a listing's QR code carries. The id, not the slug: it never changes. */
export function reviewLink(listing: Pick<BusinessListing, 'id'>): string {
  return new URL(ROUTES.placeReview(listing.id), env.NEXT_PUBLIC_SITE_URL).toString();
}

function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'listing'
  );
}

function download(href: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
}

/** Splits text into lines no wider than `maxWidth`, at most `maxLines` (the last one ellipsed). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? '';
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

/**
 * A printable A4-proportioned poster (1240×1754, 150 dpi) to stick on the counter or the wall: the
 * brand, the place, the QR code and a line on who can review.
 */
async function renderPoster(listing: BusinessListing, link: string): Promise<string> {
  const width = 1240;
  const height = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');

  await document.fonts.ready;
  const style = getComputedStyle(document.body);
  const font = style.fontFamily || 'system-ui, sans-serif';
  const ink = '#0f172a';
  const body = '#475569';
  const accent = style.getPropertyValue('--color-action').trim() || '#2563eb';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, width, 24);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = accent;
  ctx.font = `700 56px ${font}`;
  ctx.fillText(BRAND.name, width / 2, 170);

  ctx.fillStyle = ink;
  ctx.font = `800 96px ${font}`;
  ctx.fillText('Scan to review us', width / 2, 330);

  ctx.font = `600 64px ${font}`;
  let y = 440;
  for (const line of wrap(ctx, listing.name, width - 200, 2)) {
    ctx.fillText(line, width / 2, y);
    y += 80;
  }

  const qrSize = 820;
  const qrTop = 580;
  const qr = new Image();
  qr.src = await QRCode.toDataURL(link, { ...QR_OPTIONS, width: qrSize, margin: 1 });
  await qr.decode();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, (width - qrSize) / 2, qrTop, qrSize, qrSize);

  ctx.fillStyle = body;
  ctx.font = `400 40px ${font}`;
  ctx.fillText('Point your phone camera at the code', width / 2, qrTop + qrSize + 110);
  ctx.fillText('and tell other students how it was.', width / 2, qrTop + qrSize + 164);

  ctx.font = `400 30px ${font}`;
  ctx.fillText(link, width / 2, height - 90);

  return canvas.toDataURL('image/png');
}

/**
 * A listing's review QR code: students scan it at the place and land on the review form. The owner
 * can download the bare code, download or print a ready poster, or copy the link.
 */
export function ReviewQrDialog({
  listing,
  onClose,
}: {
  listing: BusinessListing | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState<'png' | 'poster' | 'print' | null>(null);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const link = listing ? reviewLink(listing) : '';

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (listing && !dialog.open) dialog.showModal();
    if (!listing && dialog.open) dialog.close();
  }, [listing]);

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    QRCode.toString(link, { ...QR_OPTIONS, type: 'svg' })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setProblem('Could not create the QR code.');
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  async function run(kind: 'png' | 'poster' | 'print', action: () => Promise<void>) {
    setBusy(kind);
    setProblem(null);
    try {
      await action();
    } catch {
      setProblem('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  function downloadPng(current: BusinessListing) {
    return run('png', async () => {
      const url = await QRCode.toDataURL(link, { ...QR_OPTIONS, width: 1024 });
      download(url, `${fileSlug(current.name)}-review-qr.png`);
    });
  }

  function downloadPoster(current: BusinessListing) {
    return run('poster', async () => {
      download(await renderPoster(current, link), `${fileSlug(current.name)}-review-poster.png`);
    });
  }

  function printPoster(current: BusinessListing) {
    return run('print', async () => {
      const poster = await renderPoster(current, link);
      // A hidden frame, not a new tab: popup blockers leave it alone and nothing is left open.
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      document.body.append(frame);
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) {
        frame.remove();
        throw new Error('Printing is not available.');
      }
      doc.title = `${current.name} — review QR`;
      doc.head.innerHTML =
        '<style>@page{size:A4;margin:0}html,body{margin:0}img{display:block;width:100vw;height:100vh;object-fit:contain}</style>';
      const img = doc.createElement('img');
      img.src = poster;
      doc.body.append(img);
      await img.decode();
      win.addEventListener('afterprint', () => frame.remove(), { once: true });
      win.focus();
      win.print();
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setProblem('Could not copy. Select the link and copy it instead.');
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={() => {
        setSvg(null);
        setProblem(null);
        setCopied(false);
        onClose();
      }}
      aria-labelledby="review-qr-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      {listing && (
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="review-qr-title" className="text-lg font-semibold">
                Review QR code
              </h2>
              <p className="text-sm text-body">
                Put it up at <span className="font-medium text-ink">{listing.name}</span>. Students
                scan it and land straight on the review form.
              </p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-md p-1 text-muted hover:bg-subtle hover:text-ink"
            >
              <Icon name="close" label="Close" />
            </button>
          </div>

          <div className="mx-auto w-full max-w-64 rounded-lg border border-line bg-white p-3">
            {svg ? (
              <div
                role="img"
                aria-label={`QR code linking to the review page for ${listing.name}`}
                className="aspect-square [&>svg]:size-full"
                // Markup generated locally by the qrcode library from our own URL.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <div className="aspect-square animate-pulse rounded bg-subtle" />
            )}
          </div>

          <div className="flex items-center gap-2 rounded-md border border-line bg-subtle px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-body" title={link}>
              {link}
            </span>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="shrink-0 text-sm font-medium text-action hover:text-action-hover"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>

          {problem && <p className="text-sm text-danger-700">{problem}</p>}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              loading={busy === 'poster'}
              disabled={busy !== null}
              onClick={() => void downloadPoster(listing)}
            >
              {busy !== 'poster' && <Icon name="download" className="size-4" />}
              Download poster
            </Button>
            <Button
              variant="secondary"
              loading={busy === 'print'}
              disabled={busy !== null}
              onClick={() => void printPoster(listing)}
            >
              {busy !== 'print' && <Icon name="printer" className="size-4" />}
              Print poster
            </Button>
            <Button
              variant="ghost"
              className="sm:col-span-2"
              loading={busy === 'png'}
              disabled={busy !== null}
              onClick={() => void downloadPng(listing)}
            >
              Download QR code only (PNG)
            </Button>
          </div>

          <p className="text-xs text-muted">
            Only signed-in student accounts can post, one review per student, and reviews follow the
            usual community rules.
          </p>
        </div>
      )}
    </dialog>
  );
}
