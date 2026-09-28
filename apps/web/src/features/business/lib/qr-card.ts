import QRCode from 'qrcode';
import { ROUTES } from '@/constants/routes';
import { env } from '@/lib/env';

/** The link a CampusPin code carries: only the random token, never an id. */
export const qrLink = (token: string): string =>
  new URL(ROUTES.qr(token), env.NEXT_PUBLIC_SITE_URL).toString();

const QR_OPTIONS = { errorCorrectionLevel: 'M', margin: 1 } as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

/**
 * A printable card (A6 proportions, 1240×1748) for a table or the counter: the CampusPin logo,
 * "Scan to order", the QR code, the business name and the table. Returns a PNG data URL.
 */
export async function renderQrCard(options: {
  token: string;
  placeName: string;
  table: string | null;
}): Promise<string> {
  const width = 1240;
  const height = 1748;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  await document.fonts.ready;
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const navy = '#052f63';
  const green = '#1f7a2e';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = navy;
  ctx.fillRect(0, 0, width, 300);
  ctx.fillStyle = green;
  ctx.fillRect(0, 300, width, 16);

  try {
    const logo = await loadImage('/logo.png');
    const logoHeight = 110;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    // The logo is dark on transparent: draw it on a white pill so it reads on the navy band.
    ctx.fillStyle = '#ffffff';
    const pillWidth = logoWidth + 80;
    ctx.beginPath();
    ctx.roundRect((width - pillWidth) / 2, 95, pillWidth, logoHeight + 30, 70);
    ctx.fill();
    ctx.drawImage(logo, (width - logoWidth) / 2, 110, logoWidth, logoHeight);
  } catch {
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 90px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText('CampusPin', width / 2, 190);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = navy;
  ctx.font = `800 92px ${font}`;
  ctx.fillText(options.table ? 'Scan to order' : 'Scan to order & use', width / 2, 450);
  ctx.fillStyle = '#4f586b';
  ctx.font = `400 42px ${font}`;
  ctx.fillText('with the CampusPin app or your phone camera', width / 2, 515);

  const qrSize = 780;
  const qr = await loadImage(
    await QRCode.toDataURL(qrLink(options.token), { ...QR_OPTIONS, width: qrSize }),
  );
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, (width - qrSize) / 2, 570, qrSize, qrSize);

  ctx.fillStyle = navy;
  ctx.font = `700 64px ${font}`;
  ctx.fillText(options.placeName.slice(0, 32), width / 2, 1470);
  if (options.table) {
    ctx.fillStyle = green;
    ctx.beginPath();
    ctx.roundRect(width / 2 - 230, 1520, 460, 120, 60);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 70px ${font}`;
    ctx.fillText(options.table, width / 2, 1605);
  }
  return canvas.toDataURL('image/png');
}

export function downloadDataUrl(href: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
}

/** Opens the cards in a print window (one per page) and prints them. */
export function printCards(cards: string[], title: string) {
  const win = window.open('', '_blank', 'noopener=no,width=800,height=1000');
  if (!win) throw new Error('Allow pop-ups to print.');
  win.document.title = title;
  const style = win.document.createElement('style');
  style.textContent =
    '@page{margin:10mm}body{margin:0}img{display:block;width:100%;max-width:105mm;margin:0 auto;page-break-after:always}';
  win.document.head.appendChild(style);
  for (const src of cards) {
    const image = win.document.createElement('img');
    image.src = src;
    image.alt = '';
    win.document.body.appendChild(image);
  }
  win.addEventListener('load', () => win.print());
  setTimeout(() => win.print(), 600);
}
