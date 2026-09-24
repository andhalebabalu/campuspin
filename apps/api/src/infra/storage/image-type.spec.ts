import { sniffImageType } from './image-type.js';

const bytes = (...values: Array<number | string>): Uint8Array =>
  Uint8Array.from(
    values.flatMap((value) =>
      typeof value === 'string' ? [...value].map((char) => char.charCodeAt(0)) : [value],
    ),
  );

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP by their first bytes', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('image/png');
    expect(sniffImageType(bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp');
  });

  it('refuses everything else, whatever it claims to be', () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(bytes('GIF89a'))).toBeNull();
    expect(sniffImageType(bytes('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(bytes('<?php echo 1; ?>'))).toBeNull();
    // A RIFF container that is not WebP (e.g. a WAV file).
    expect(sniffImageType(bytes('RIFF', 0x24, 0, 0, 0, 'WAVEfmt '))).toBeNull();
  });

  it('refuses empty and truncated files', () => {
    expect(sniffImageType(new Uint8Array())).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageType(bytes('RIFF'))).toBeNull();
  });
});
