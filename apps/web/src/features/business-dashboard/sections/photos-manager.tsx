'use client';

import { ApiClientError } from '@platform/api-client';
import {
  MAX_PLACE_IMAGES,
  UPLOAD_IMAGE_MAX_BYTES,
  UPLOAD_IMAGE_TYPES,
  type OwnedPlace,
} from '@platform/contracts';
import { useRef, useState, type ChangeEvent } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { compressImage } from '@/lib/images/compress-image';
import { businessService } from '@/services/business.service';
import { uploadsService } from '@/services/uploads.service';
import { PlaceScope } from '../place-scope';
import { Panel } from './overview';

const MAX_MB = UPLOAD_IMAGE_MAX_BYTES / (1024 * 1024);

function PhotoGrid({
  place,
  setPlace,
}: {
  place: OwnedPlace;
  setPlace: (place: OwnedPlace) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const remaining = MAX_PLACE_IMAGES - place.images.length;

  const fail = (caught: unknown, fallback: string) =>
    toast.show(caught instanceof ApiClientError ? caught.message : fallback, 'error');

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, Math.max(0, remaining));
    event.target.value = '';
    let current = place;
    for (const file of files) {
      if (!(UPLOAD_IMAGE_TYPES as readonly string[]).includes(file.type)) {
        toast.show(`${file.name}: only JPEG, PNG or WebP images.`, 'error');
        continue;
      }
      if (file.size > UPLOAD_IMAGE_MAX_BYTES * 4) {
        toast.show(`${file.name} is too large.`, 'error');
        continue;
      }
      setUploading((count) => count + 1);
      try {
        const small = await compressImage(file);
        if (small.size > UPLOAD_IMAGE_MAX_BYTES) {
          toast.show(`${file.name} is larger than ${MAX_MB} MB even after resizing.`, 'error');
          continue;
        }
        const uploaded = await uploadsService.uploadImage(small);
        current = (await businessService.addPhoto(place.id, { imageUrl: uploaded.data.url })).data;
        setPlace(current);
      } catch (caught) {
        fail(caught, `${file.name} could not be uploaded.`);
      } finally {
        setUploading((count) => count - 1);
      }
    }
    if (files.length > 0) toast.show('Photos updated');
  }

  async function makeCover(imageId: string) {
    setBusyId(imageId);
    try {
      setPlace((await businessService.updatePhoto(place.id, imageId, { isCover: true })).data);
      toast.show('Cover photo changed');
    } catch (caught) {
      fail(caught, 'Could not change the cover.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(imageId: string) {
    if (!window.confirm('Remove this photo from your page?')) return;
    setBusyId(imageId);
    try {
      setPlace((await businessService.removePhoto(place.id, imageId)).data);
      toast.show('Photo removed');
    } catch (caught) {
      fail(caught, 'Could not remove the photo.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title={`${place.images.length} of ${MAX_PLACE_IMAGES} photos`}
      action={
        remaining > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white hover:bg-action-hover"
          >
            <Icon name="camera" className="size-4" /> Upload photos
          </button>
        )
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_IMAGE_TYPES.join(',')}
        multiple
        className="sr-only"
        onChange={(event) => void upload(event)}
      />
      {place.images.length === 0 && uploading === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-6 py-14 text-center hover:border-primary-300"
        >
          <Icon name="image" className="size-8 text-muted" />
          <span className="font-semibold text-ink">No photos yet</span>
          <span className="max-w-sm text-sm text-muted">
            Places with photos get far more visits. Add the entrance, the inside and what you offer.
            JPEG, PNG or WebP; large photos are resized for you.
          </span>
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {place.images.map((image) => (
            <li
              key={image.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-subtle"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API. */}
              <img
                src={image.imageUrl}
                alt={image.altText ?? ''}
                loading="lazy"
                className="size-full object-cover"
              />
              {image.isCover && (
                <span className="absolute top-2 left-2 rounded-full bg-ink/80 px-2 py-0.5 text-xs font-semibold text-white">
                  Cover
                </span>
              )}
              <div className="absolute inset-x-2 bottom-2 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                {!image.isCover && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void makeCover(image.id)}
                    className="flex-1 rounded-lg bg-surface/95 px-2 py-1.5 text-xs font-semibold text-ink shadow hover:bg-surface disabled:opacity-60"
                  >
                    Set as cover
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void remove(image.id)}
                  aria-label="Remove photo"
                  className="rounded-lg bg-surface/95 p-1.5 text-danger-700 shadow hover:bg-surface disabled:opacity-60"
                >
                  <Icon name="trash" className="size-4" />
                </button>
              </div>
            </li>
          ))}
          {Array.from({ length: uploading }, (_, index) => (
            <li
              key={`up-${index}`}
              className="flex aspect-square animate-pulse items-center justify-center rounded-xl border border-line bg-subtle text-xs text-muted"
            >
              Uploading…
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function PhotosManager() {
  return (
    <>
      <PageHeader
        title="Photos"
        description="Your gallery on the public page. The cover photo also shows in search and link previews."
      />
      <PlaceScope>
        {(place, setPlace) => <PhotoGrid place={place} setPlace={setPlace} />}
      </PlaceScope>
    </>
  );
}
