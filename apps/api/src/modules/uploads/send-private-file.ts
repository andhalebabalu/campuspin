import type { Response } from 'express';

/**
 * Sends a private file: never cached, never sniffed as another type. PDFs download (with the name
 * the student gave, ASCII-safe); photos open inline.
 */
export function sendPrivateFile(
  res: Response,
  file: { bytes: Buffer; contentType: string; fileName: string },
): void {
  const safeName = file.fileName.replace(/[^A-Za-z0-9 ._()-]/g, '_') || 'file';
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    file.contentType === 'application/pdf' ? `attachment; filename="${safeName}"` : 'inline',
  );
  res.status(200).send(file.bytes);
}
