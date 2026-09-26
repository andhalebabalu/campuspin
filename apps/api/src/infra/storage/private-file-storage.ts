import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { UploadImageType } from '@platform/contracts';
import { EXTENSION_FOR_TYPE } from './image-type.js';

/**
 * Storage for PRIVATE files (student ID photos). Unlike `ImageStorage` it never returns a URL: it
 * returns an opaque key that only server code can turn back into bytes, behind a permission check.
 * A cloud implementation would use a private bucket with no public access.
 */
export abstract class PrivateFileStorage {
  /** Stores already-validated bytes; returns the key to read or delete them later. */
  abstract save(bytes: Buffer, type: UploadImageType): Promise<string>;
  abstract read(key: string): Promise<Buffer>;
  /** Removes the file. Deleting a file that is already gone is not an error. */
  abstract delete(key: string): Promise<void>;
}

/** Keys are always "<uuid>.<ext>": anything else (a path, "..") is refused before touching disk. */
const KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function isPrivateKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Local-disk private storage in `PRIVATE_UPLOAD_DIR`, a directory the API never serves (the config
 * refuses to start if it sits inside the public `UPLOAD_DIR`).
 */
export class LocalDiskPrivateFileStorage extends PrivateFileStorage {
  constructor(private readonly directory: string) {
    super();
  }

  async save(bytes: Buffer, type: UploadImageType): Promise<string> {
    const key = `${randomUUID()}.${EXTENSION_FOR_TYPE[type]}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathOf(key), bytes, { flag: 'wx', mode: 0o600 });
    return key;
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.pathOf(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    if (!isPrivateKey(key)) throw new Error('Invalid private file key');
    return path.join(this.directory, key);
  }
}
