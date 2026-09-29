/** Longest side after resizing: sharp on any screen, a fraction of a phone photo's size. */
const MAX_SIDE = 1920;
/** Smaller files are left alone (already light enough). */
const SKIP_BELOW_BYTES = 400 * 1024;

/**
 * Shrinks a photo in the browser before upload: at most 1920 px on the long side, re-encoded in its
 * own format (JPEG/WebP at 85% quality; PNG kept lossless so logos stay crisp). Returns the original
 * whenever resizing is not supported or would not make it smaller; the server validates either way.
 */
export async function compressImage(file: File): Promise<File> {
  if (file.size < SKIP_BELOW_BYTES || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === 'image/png') {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, file.type === 'image/png' ? undefined : 0.85),
    );
    // Some browsers fall back to PNG for a type they cannot encode: keep the original then.
    if (!blob || blob.type !== file.type || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: file.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}
