import type { UploadImageType } from '@platform/contracts';

/** The file extension each accepted type is stored under (and so served with). */
export const EXTENSION_FOR_TYPE: Readonly<Record<UploadImageType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

/**
 * The image type from the file's first bytes ("magic numbers"), or null when it is not one we
 * accept. The client-supplied name and Content-Type are never trusted: a script renamed to
 * `photo.jpg` is refused here, and the stored extension comes from what the bytes actually are.
 */
export function sniffImageType(bytes: Uint8Array): UploadImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}
