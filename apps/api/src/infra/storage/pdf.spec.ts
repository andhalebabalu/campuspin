import { deflateSync } from 'node:zlib';
import { makePdf } from '../../../test/support/pdf-fixture.js';
import { inspectPdf } from './pdf.js';

describe('inspectPdf', () => {
  it('counts the pages of a plain PDF', () => {
    expect(inspectPdf(makePdf(3))).toEqual({ pageCount: 3, encrypted: false });
  });

  it('counts pages hidden in a compressed object stream', () => {
    const inner = Buffer.from(
      '3 0 4 60 << /Type /Page /Parent 2 0 R >> << /Type /Page /Parent 2 0 R >>',
      'latin1',
    );
    const packed = deflateSync(inner);
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.5\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n', 'latin1'),
      Buffer.from(
        '5 0 obj << /Type /ObjStm /N 2 /First 8 /Filter /FlateDecode >>\nstream\n',
        'latin1',
      ),
      packed,
      Buffer.from('\nendstream endobj\n%%EOF\n', 'latin1'),
    ]);
    expect(inspectPdf(pdf)?.pageCount).toBe(2);
  });

  it('refuses things that only claim to be PDFs, and flags encrypted ones', () => {
    expect(inspectPdf(Buffer.from('MZ this is an exe renamed to .pdf'))).toBeNull();
    expect(inspectPdf(Buffer.from('%PDF-1.4 but cut off'))).toBeNull();
    const locked = Buffer.from(
      makePdf(1).toString('latin1').replace('trailer <<', 'trailer << /Encrypt 9 0 R'),
      'latin1',
    );
    expect(inspectPdf(locked)?.encrypted).toBe(true);
  });
});
