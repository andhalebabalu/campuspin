import { inflateSync } from 'node:zlib';

export interface PdfInfo {
  pageCount: number;
  encrypted: boolean;
}

/** Largest PDF accepted for printing. */
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
/** Most pages one print job may have. */
export const PDF_MAX_PAGES = 500;
/** Stop inflating compressed streams past this much output (a "zip bomb" guard). */
const INFLATE_BUDGET = 64 * 1024 * 1024;

const PAGE_OBJECT = /\/Type\s*\/Page(?![A-Za-z])/g;
const PAGES_COUNT =
  /\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)|\/Count\s+(\d+)[\s\S]{0,400}?\/Type\s*\/Pages/g;

function countPages(text: string): { objects: number; declared: number } {
  const objects = text.match(PAGE_OBJECT)?.length ?? 0;
  let declared = 0;
  for (const match of text.matchAll(PAGES_COUNT)) {
    declared = Math.max(declared, Number(match[1] ?? match[2] ?? 0));
  }
  return { objects, declared };
}

/**
 * Checks that bytes are a PDF (by its header, never the file name) and counts its pages, without
 * a PDF library: page objects are counted in the file and inside compressed object streams (which
 * modern PDFs use), with the page tree's own `/Count` as a cross-check. Returns null when the bytes
 * are not a readable PDF.
 */
export function inspectPdf(bytes: Buffer): PdfInfo | null {
  const head = bytes.subarray(0, 1024).toString('latin1');
  if (!head.includes('%PDF-')) return null;
  const tail = bytes.subarray(Math.max(0, bytes.length - 2048)).toString('latin1');
  if (!tail.includes('%%EOF')) return null;

  const text = bytes.toString('latin1');
  const encrypted = /\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</.test(text);
  let { objects, declared } = countPages(text);

  // Page objects inside compressed object streams are invisible in the raw text: inflate those.
  let budget = INFLATE_BUDGET;
  const stream = /\/Type\s*\/ObjStm[\s\S]{0,300}?>>\s*stream\r?\n/g;
  for (const match of text.matchAll(stream)) {
    const start = (match.index ?? 0) + match[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0 || budget <= 0) break;
    try {
      const inflated = inflateSync(bytes.subarray(start, end), { maxOutputLength: budget });
      budget -= inflated.length;
      const found = countPages(inflated.toString('latin1'));
      objects += found.objects;
      declared = Math.max(declared, found.declared);
    } catch {
      // Not deflated or damaged: skip it; the declared count still stands.
    }
  }

  const pageCount = objects > 0 ? objects : declared;
  if (pageCount < 1) return null;
  return { pageCount, encrypted };
}
