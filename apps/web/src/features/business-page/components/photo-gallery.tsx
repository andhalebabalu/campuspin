'use client';

import type { PlaceDetail } from '@platform/contracts';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';

type Image = PlaceDetail['images'][number];

/**
 * The photo grid: the first photo large, the next four around it, lazy-loaded; tapping any opens a
 * full-screen viewer with previous/next (arrow keys work too).
 */
export function PhotoGallery({ images, name }: { images: readonly Image[]; name: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const shown = images.slice(0, 5);
  const extra = images.length - shown.length;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (index !== null && !dialog.open) dialog.showModal();
    if (index === null && dialog.open) dialog.close();
  }, [index]);

  const step = (delta: number) =>
    setIndex((current) =>
      current === null ? null : (current + delta + images.length) % images.length,
    );

  const current = index === null ? null : images[index];

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:grid-rows-2">
        {shown.map((image, position) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setIndex(position)}
            className={`group relative overflow-hidden rounded-xl bg-subtle focus-visible:outline-2 focus-visible:outline-ring ${
              position === 0
                ? 'col-span-2 aspect-[4/3] sm:row-span-2 sm:aspect-auto'
                : 'aspect-square'
            }`}
            aria-label={`Open photo ${position + 1} of ${images.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded images live on the API host. */}
            <img
              src={image.imageUrl}
              alt={image.altText ?? `${name}, photo ${position + 1}`}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {position === shown.length - 1 && extra > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-lg font-semibold text-white">
                +{extra} more
              </span>
            )}
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setIndex(null)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') step(1);
          if (event.key === 'ArrowLeft') step(-1);
        }}
        className="m-auto h-dvh max-h-none w-screen max-w-none bg-ink/95 p-0 backdrop:bg-ink/80"
        aria-label="Photos"
      >
        {current && (
          <div className="flex size-full flex-col">
            <div className="flex items-center justify-between px-4 py-3 text-sm text-white/80">
              <span>
                {(index ?? 0) + 1} / {images.length}
              </span>
              <button
                type="button"
                onClick={() => setIndex(null)}
                className="rounded-full p-2 hover:bg-white/10"
                aria-label="Close"
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>
            <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded images live on the API host. */}
              <img
                src={current.imageUrl}
                alt={current.altText ?? name}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    className="absolute left-3 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                    aria-label="Previous photo"
                  >
                    <Icon name="chevronLeft" className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    className="absolute right-3 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                    aria-label="Next photo"
                  >
                    <Icon name="chevronRight" className="size-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
