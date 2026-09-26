import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { UploadImageType } from '@platform/contracts';
import { EXTENSION_FOR_TYPE } from './image-type.js';

/** The public path uploaded files are served under (outside the `/api` prefix). */
export const UPLOADS_ROUTE = '/uploads';

/**
 * Where uploaded images live. Callers only ever get back a public URL, which is what the database
 * stores (`imageUrl`), so moving to Cloudinary/S3 later is a new implementation of this class and
 * nothing else changes.
 */
export abstract class ImageStorage {
  /** Stores already-validated image bytes and returns the URL they are publicly served at. */
  abstract save(bytes: Buffer, type: UploadImageType): Promise<string>;

  /** Whether a URL points at a file this storage saved (so a form cannot smuggle in outside URLs). */
  abstract owns(url: string): boolean;
}

/**
 * Development/small-deployment storage: files on the API's disk, served statically by the API at
 * `${apiBaseUrl}/uploads/<uuid>.<ext>`. Names are random (never the uploader's file name), so a
 * stored file can neither overwrite another nor be guessed.
 */
export class LocalDiskImageStorage extends ImageStorage {
  constructor(
    private readonly directory: string,
    private readonly apiBaseUrl: string,
  ) {
    super();
  }

  async save(bytes: Buffer, type: UploadImageType): Promise<string> {
    const name = `${randomUUID()}.${EXTENSION_FOR_TYPE[type]}`;
    await mkdir(this.directory, { recursive: true });
    // `wx`: fail rather than overwrite, however unlikely a UUID collision is.
    await writeFile(path.join(this.directory, name), bytes, { flag: 'wx' });
    return `${this.apiBaseUrl}${UPLOADS_ROUTE}/${name}`;
  }

  owns(url: string): boolean {
    const prefix = `${this.apiBaseUrl}${UPLOADS_ROUTE}/`;
    return url.startsWith(prefix) && STORED_NAME.test(url.slice(prefix.length));
  }
}

/** `<uuid>.<ext>`, exactly as `save` names files. */
const STORED_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
