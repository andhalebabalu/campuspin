'use client';

import { ApiClientError } from '@platform/api-client';
import { UPLOAD_IMAGE_MAX_BYTES, UPLOAD_IMAGE_TYPES } from '@platform/contracts';
import { useId, useRef, useState, type ChangeEvent } from 'react';
import { uploadsService } from '@/services/uploads.service';

const MAX_MB = UPLOAD_IMAGE_MAX_BYTES / (1024 * 1024);

export interface ImageUploaderProps {
  label: string;
  /** URLs of the images uploaded so far, in display order (the first is the cover). */
  value: string[];
  onChange: (urls: string[]) => void;
  /** How many images may be attached. 1 turns this into a single-image picker (e.g. a logo). */
  max?: number;
  hint?: string;
  error?: string;
  /** Reports whether an upload is still running, so the form can hold its submit. */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Upload photos straight from the device (`POST /uploads/images`): each file is uploaded as soon
 * as it is chosen and only its returned URL is kept, so the surrounding form submits plain URLs.
 * The type and size are checked here for a quick answer, and again by the server, which decides.
 */
export function ImageUploader({
  label,
  value,
  onChange,
  max = 5,
  hint,
  error,
  onBusyChange,
}: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const remaining = max - value.length;

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setProblem(null);

    const accepted = files.slice(0, Math.max(0, remaining));
    if (files.length > accepted.length) setProblem(`You can add up to ${max} photos.`);

    const valid = accepted.filter((file) => {
      if (!(UPLOAD_IMAGE_TYPES as readonly string[]).includes(file.type)) {
        setProblem(`${file.name}: only JPEG, PNG or WebP images.`);
        return false;
      }
      if (file.size > UPLOAD_IMAGE_MAX_BYTES) {
        setProblem(`${file.name} is larger than ${MAX_MB} MB.`);
        return false;
      }
      return true;
    });
    if (valid.length === 0) return;

    setUploading((count) => count + valid.length);
    onBusyChange?.(true);
    let urls = value;
    for (const file of valid) {
      try {
        const result = await uploadsService.uploadImage(file);
        urls = max === 1 ? [result.data.url] : [...urls, result.data.url];
        onChange(urls);
      } catch (caught) {
        setProblem(
          caught instanceof ApiClientError
            ? `${file.name}: ${caught.message}`
            : `${file.name} could not be uploaded.`,
        );
      } finally {
        setUploading((count) => count - 1);
      }
    }
    onBusyChange?.(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>

      <div className="flex flex-wrap gap-3">
        {value.map((url, index) => (
          <div
            key={url}
            className="relative size-24 overflow-hidden rounded-md border border-line bg-subtle"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API. */}
            <img src={url} alt="" className="size-full object-cover" />
            {index === 0 && max > 1 && (
              <span className="absolute left-1 top-1 rounded bg-ink/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Cover
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(value.filter((other) => other !== url))}
              aria-label="Remove photo"
              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-ink/75 text-sm text-white hover:bg-ink"
            >
              ×
            </button>
          </div>
        ))}

        {Array.from({ length: uploading }, (_, index) => (
          <div
            key={`uploading-${index}`}
            className="flex size-24 animate-pulse items-center justify-center rounded-md border border-line bg-subtle text-xs text-muted"
          >
            Uploading…
          </div>
        ))}

        {remaining > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`flex size-24 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-sm text-muted transition-colors hover:border-primary-400 hover:text-ink ${error ? 'border-danger-600' : 'border-control'}`}
          >
            <span className="text-2xl leading-none">+</span>
            {max === 1 && value.length === 0 ? 'Upload' : 'Add photo'}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={UPLOAD_IMAGE_TYPES.join(',')}
        multiple={max > 1}
        onChange={(event) => void handleFiles(event)}
        className="sr-only"
      />
      <p className="text-sm text-muted">
        {hint ?? `JPEG, PNG or WebP, up to ${MAX_MB} MB each.`}
        {max > 1 && ` ${value.length}/${max} added.`}
      </p>
      {problem && <p className="text-sm text-danger-700">{problem}</p>}
      {error && <p className="text-sm text-danger-700">{error}</p>}
    </div>
  );
}
