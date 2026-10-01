import type { Invoice } from '@platform/contracts';

/**
 * A dependency-free A4 invoice PDF. It uses the PDF's built-in Helvetica (every reader has it), so
 * text is limited to the Latin-1 range: other characters print as "?" and ₹ prints as "Rs.".
 * The layout is fixed and simple on purpose: header, bill-to, item table, totals, payment.
 */

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;

// Helvetica advance widths (1/1000 em) for ASCII 32..126, from the standard AFM.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Latin-1 only; everything else becomes "?" (the rupee sign becomes "Rs."). */
function latin1(text: string): string {
  return text
    .replace(/₹/g, 'Rs.')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
}

function widthOf(text: string, size: number, bold = false): number {
  let units = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    units += code >= 32 && code <= 126 ? (WIDTHS[code - 32] ?? 556) : 556;
  }
  return (units / 1000) * size * (bold ? 1.06 : 1);
}

function fit(text: string, size: number, maxWidth: number, bold = false): string {
  if (widthOf(text, size, bold) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && widthOf(`${cut}...`, size, bold) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

const escape = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

class Page {
  readonly ops: string[] = [];

  text(
    x: number,
    y: number,
    raw: string,
    size = 10,
    options: { bold?: boolean; color?: string; align?: 'left' | 'right' } = {},
  ) {
    const value = latin1(raw);
    const startX = options.align === 'right' ? x - widthOf(value, size, options.bold) : x;
    this.ops.push(
      `BT ${options.color ?? '0.1 0.13 0.2'} rg /${options.bold ? 'F2' : 'F1'} ${size} Tf ${startX.toFixed(2)} ${(PAGE_H - y).toFixed(2)} Td (${escape(value)}) Tj ET`,
    );
  }

  line(x1: number, y: number, x2: number, color = '0.87 0.89 0.92', width = 0.75) {
    this.ops.push(`${color} RG ${width} w ${x1} ${PAGE_H - y} m ${x2} ${PAGE_H - y} l S`);
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ops.push(`${color} rg ${x} ${PAGE_H - y - h} ${w} ${h} re f`);
  }
}

const rupees = (amount: number) => `Rs. ${amount.toLocaleString('en-IN')}`;
const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

/** Builds the PDF bytes of one invoice. */
export function invoicePdf(invoice: Invoice, footer: string): Buffer {
  const pages: Page[] = [];
  let page = new Page();
  pages.push(page);
  const right = PAGE_W - MARGIN;
  const muted = '0.42 0.46 0.54';
  const brand = '0.04 0.39 0.81';

  // Header band.
  page.rect(0, 0, PAGE_W, 6, brand);
  page.text(MARGIN, 58, fit(invoice.business.name, 18, 300, true), 18, { bold: true });
  let y = 76;
  for (const detail of [
    invoice.business.address,
    [invoice.business.phone, invoice.business.email].filter(Boolean).join('   '),
  ]) {
    if (!detail) continue;
    page.text(MARGIN, y, fit(detail, 9, 300), 9, { color: muted });
    y += 13;
  }
  page.text(right, 58, 'INVOICE', 20, { bold: true, align: 'right', color: brand });
  page.text(right, 78, invoice.number, 10, { bold: true, align: 'right' });
  page.text(right, 92, `Date: ${date(invoice.issuedAt)}`, 9, { align: 'right', color: muted });
  page.text(
    right,
    105,
    `Status: ${invoice.status === 'PAID' ? 'Paid' : invoice.status === 'CANCELLED' ? 'Cancelled' : 'Issued'}`,
    9,
    { align: 'right', color: muted },
  );

  // Bill to / order.
  y = 140;
  page.line(MARGIN, y - 12, right);
  page.text(MARGIN, y, 'BILLED TO', 8, { bold: true, color: muted });
  page.text(MARGIN, y + 15, fit(invoice.customer.name, 11, 240), 11, { bold: true });
  page.text(330, y, 'ORDER', 8, { bold: true, color: muted });
  page.text(330, y + 15, invoice.order.code, 11, { bold: true });
  page.text(
    330,
    y + 29,
    `Placed ${date(invoice.order.placedAt)}${invoice.order.table ? ` - ${invoice.order.table}` : ''}`,
    9,
    { color: muted },
  );

  // Item table.
  const cols = { item: MARGIN + 8, qty: 360, unit: 450, amount: right - 8 };
  const header = (at: number) => {
    page.rect(MARGIN, at - 13, right - MARGIN, 20, '0.96 0.97 0.98');
    page.text(cols.item, at, 'ITEM', 8, { bold: true, color: muted });
    page.text(cols.qty, at, 'QTY', 8, { bold: true, color: muted, align: 'right' });
    page.text(cols.unit, at, 'UNIT PRICE', 8, { bold: true, color: muted, align: 'right' });
    page.text(cols.amount, at, 'AMOUNT', 8, { bold: true, color: muted, align: 'right' });
  };
  y = 205;
  header(y);
  y += 24;
  for (const item of invoice.items) {
    const height = item.options.length ? 30 : 20;
    if (y + height > PAGE_H - 170) {
      page = new Page();
      pages.push(page);
      y = 70;
      header(y);
      y += 24;
    }
    page.text(cols.item, y, fit(item.name, 10, 270), 10);
    page.text(cols.qty, y, String(item.quantity), 10, { align: 'right' });
    page.text(cols.unit, y, rupees(item.unitPrice), 10, { align: 'right' });
    page.text(cols.amount, y, rupees(item.lineTotal), 10, { align: 'right' });
    if (item.options.length) {
      page.text(cols.item, y + 12, fit(`+ ${item.options.join(', ')}`, 8, 270), 8, {
        color: muted,
      });
    }
    y += height;
    page.line(MARGIN, y - 8, right);
  }

  // Totals.
  y += 10;
  const totalRow = (label: string, value: string, bold = false) => {
    page.text(390, y, label, bold ? 11 : 10, { bold, color: bold ? undefined : muted });
    page.text(cols.amount, y, value, bold ? 11 : 10, { bold, align: 'right' });
    y += bold ? 20 : 16;
  };
  totalRow('Subtotal', rupees(invoice.subtotal));
  if (invoice.discount > 0) totalRow('Discount', `- ${rupees(invoice.discount)}`);
  if (invoice.tax > 0) totalRow('Tax', rupees(invoice.tax));
  page.line(380, y - 10, right, '0.1 0.13 0.2', 1);
  y += 4;
  totalRow('Grand total', rupees(invoice.total), true);

  // Payment.
  y += 10;
  page.text(MARGIN, y, 'PAYMENT', 8, { bold: true, color: muted });
  page.text(
    MARGIN,
    y + 15,
    invoice.paymentStatus === 'PAID'
      ? `Paid${invoice.paidAt ? ` on ${date(invoice.paidAt)}` : ''}`
      : invoice.paymentStatus === 'REFUNDED'
        ? 'Refunded'
        : 'Not paid yet',
    10,
    { bold: true },
  );
  page.text(MARGIN, y + 29, `Method: ${invoice.paymentMethod}`, 9, { color: muted });

  // Footer on every page.
  pages.forEach((each, index) => {
    each.line(MARGIN, PAGE_H - 50, right);
    each.text(MARGIN, PAGE_H - 34, footer, 8, { color: muted });
    if (pages.length > 1) {
      each.text(right, PAGE_H - 34, `Page ${index + 1} of ${pages.length}`, 8, {
        color: muted,
        align: 'right',
      });
    }
  });

  return assemble(pages, invoice.number);
}

/** Writes the PDF objects: catalog, pages, two standard fonts, one content stream per page. */
function assemble(pages: Page[], title: string): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add('');
  const pagesObj = add('');
  const font1 = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const font2 = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );
  const info = add(`<< /Title (${escape(latin1(title))}) /Producer (CampusPin) >>`);
  const kids: number[] = [];
  for (const page of pages) {
    const content = page.ops.join('\n');
    const stream = add(
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    );
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${stream} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] =
    `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
