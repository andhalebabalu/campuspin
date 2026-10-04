'use client';

import { UPLOAD_IMAGE_MAX_BYTES, UPLOAD_IMAGE_TYPES } from '@platform/contracts';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/button';

/** The round crop window on screen, and the square photo it produces. */
const VIEW = 288;
const OUTPUT = 512;
const MAX_ZOOM = 4;

interface Loaded {
  image: HTMLImageElement;
  url: string;
}

interface Placement {
  zoom: number; // 1 = the image just covers the window
  x: number; // top-left of the image inside the window, in screen px
  y: number;
}

/** Keeps the window fully covered by the image at the current zoom. */
function clamp(p: Placement, image: HTMLImageElement): Placement {
  const base = VIEW / Math.min(image.naturalWidth, image.naturalHeight);
  const width = image.naturalWidth * base * p.zoom;
  const height = image.naturalHeight * base * p.zoom;
  return {
    zoom: p.zoom,
    x: Math.min(0, Math.max(VIEW - width, p.x)),
    y: Math.min(0, Math.max(VIEW - height, p.y)),
  };
}

/**
 * Pick a photo, drag it inside the round window and zoom until it looks right, then save. The
 * result is a 512 px square JPEG (the round frame is only how it is shown).
 */
export function AvatarCropDialog({
  open,
  onClose,
  onSave,
  title = 'Profile photo',
  hint = 'Choose a clear photo of your face.',
  shape = 'round',
  saveLabel = 'Save photo',
}: {
  open: boolean;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
  /** Defaults suit a member's profile photo; a business logo passes its own. */
  title?: string;
  hint?: string;
  /** Only how the frame looks while cropping: the saved image is always a square. */
  shape?: 'round' | 'square';
  saveLabel?: string;
}) {
  const frame = shape === 'round' ? 'rounded-full' : 'rounded-md';
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ startX: number; startY: number; from: Placement } | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [place, setPlace] = useState<Placement>({ zoom: 1, x: 0, y: 0 });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Free the previous preview when a new photo is picked or the dialog unmounts.
  useEffect(
    () => () => {
      if (loaded) URL.revokeObjectURL(loaded.url);
    },
    [loaded],
  );

  function reset() {
    setLoaded(null);
    setProblem(null);
    setPlace({ zoom: 1, x: 0, y: 0 });
  }

  function pick(file: File | undefined) {
    if (!file) return;
    if (!(UPLOAD_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setProblem('Use a JPEG, PNG or WebP photo.');
      return;
    }
    if (file.size > UPLOAD_IMAGE_MAX_BYTES * 4) {
      setProblem('That photo is very large. Pick one under 20 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      // Start centred, just covering the window.
      const base = VIEW / Math.min(image.naturalWidth, image.naturalHeight);
      setPlace({
        zoom: 1,
        x: (VIEW - image.naturalWidth * base) / 2,
        y: (VIEW - image.naturalHeight * base) / 2,
      });
      setLoaded({ image, url });
      setProblem(null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setProblem('Could not open that image.');
    };
    image.src = url;
  }

  function zoomTo(zoom: number) {
    if (!loaded) return;
    // Zoom around the centre of the window, so the middle of the photo stays put.
    setPlace((current) => {
      const ratio = zoom / current.zoom;
      const centre = VIEW / 2;
      return clamp(
        {
          zoom,
          x: centre - (centre - current.x) * ratio,
          y: centre - (centre - current.y) * ratio,
        },
        loaded.image,
      );
    });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!loaded) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startY: event.clientY, from: place };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || !loaded) return;
    const { startX, startY, from } = drag.current;
    setPlace(
      clamp(
        { ...from, x: from.x + event.clientX - startX, y: from.y + event.clientY - startY },
        loaded.image,
      ),
    );
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!loaded) return;
    const step = event.shiftKey ? 20 : 5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setPlace((current) =>
        clamp({ ...current, x: current.x + move[0], y: current.y + move[1] }, loaded.image),
      );
    } else if (event.key === '+' || event.key === '=') {
      zoomTo(Math.min(MAX_ZOOM, place.zoom + 0.1));
    } else if (event.key === '-') {
      zoomTo(Math.max(1, place.zoom - 0.1));
    }
  }

  async function save() {
    if (!loaded) return;
    setBusy(true);
    setProblem(null);
    try {
      const { image } = loaded;
      const scale = (VIEW / Math.min(image.naturalWidth, image.naturalHeight)) * place.zoom;
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No canvas');
      context.imageSmoothingQuality = 'high';
      // The part of the photo inside the window, in the photo's own pixels.
      context.drawImage(
        image,
        -place.x / scale,
        -place.y / scale,
        VIEW / scale,
        VIEW / scale,
        0,
        0,
        OUTPUT,
        OUTPUT,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9),
      );
      if (!blob) throw new Error('No image');
      await onSave(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      reset();
      onClose();
    } catch (caught) {
      setProblem(
        caught instanceof Error && caught.message ? caught.message : 'Could not save the photo.',
      );
    } finally {
      setBusy(false);
    }
  }

  const scale = loaded
    ? (VIEW / Math.min(loaded.image.naturalWidth, loaded.image.naturalHeight)) * place.zoom
    : 1;

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        reset();
        onClose();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/50"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-body">
            {loaded
              ? `Drag to move, and zoom until it fits the ${shape === 'round' ? 'circle' : 'square'}.`
              : hint}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_IMAGE_TYPES.join(',')}
          className="sr-only"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        {loaded ? (
          <>
            <div
              role="application"
              tabIndex={0}
              aria-label="Crop area. Use the arrow keys to move the photo and plus or minus to zoom."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKeyDown}
              onWheel={(event) =>
                zoomTo(Math.min(MAX_ZOOM, Math.max(1, place.zoom - event.deltaY * 0.002)))
              }
              className="relative mx-auto cursor-grab touch-none overflow-hidden rounded-lg bg-ink select-none focus-visible:outline-2 focus-visible:outline-action active:cursor-grabbing"
              style={{ width: VIEW, height: VIEW }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a page image. */}
              <img
                src={loaded.url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
                style={{
                  width: loaded.image.naturalWidth,
                  height: loaded.image.naturalHeight,
                  transform: `translate(${place.x}px, ${place.y}px) scale(${scale})`,
                }}
              />
              {/* Everything outside the frame is dimmed: that part will not show. */}
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 ${frame}`}
                style={{ boxShadow: '0 0 0 999px rgb(11 18 32 / 0.55)' }}
              />
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 border-2 border-white/80 ${frame}`}
              />
            </div>

            <label className="flex items-center gap-3 text-sm text-body">
              <span aria-hidden>−</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={place.zoom}
                onChange={(event) => zoomTo(Number(event.target.value))}
                aria-label="Zoom"
                className="flex-1 accent-[var(--color-action)]"
              />
              <span aria-hidden>+</span>
            </label>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mx-auto flex size-48 flex-col items-center justify-center gap-2 rounded-full border-2 border-dashed border-primary-200 bg-primary-50 text-sm font-medium text-action hover:bg-primary-100"
          >
            Choose a photo
          </button>
        )}

        {problem && <p className="text-sm text-danger-700">{problem}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          {loaded && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              Another photo
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => dialogRef.current?.close()}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} loading={busy} disabled={!loaded}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
