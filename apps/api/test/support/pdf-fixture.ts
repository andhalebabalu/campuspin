/** A tiny but real, uncompressed PDF with `pages` blank pages. */
export function makePdf(pages: number): Buffer {
  const kids = Array.from({ length: pages }, (_, index) => `${index + 3} 0 R`).join(' ');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pages} >> endobj`,
    ...Array.from(
      { length: pages },
      (_, index) =>
        `${index + 3} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj`,
    ),
  ];
  return Buffer.from(
    `%PDF-1.4\n${objects.join('\n')}\ntrailer << /Root 1 0 R >>\n%%EOF\n`,
    'latin1',
  );
}
