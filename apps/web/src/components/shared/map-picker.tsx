'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  reverseGeocode,
  searchPlaces,
  type GeoPoint,
  type GeocodeResult,
} from '@/lib/geo/nominatim';

/** Ahilyanagar: where the first colleges are. The map opens here until a point is chosen. */
const DEFAULT_CENTER: GeoPoint = { latitude: 19.0948, longitude: 74.748 };
const PICKED_ZOOM = 17;

const PIN_HTML = `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1Z" fill="#e8590c" stroke="#fff" stroke-width="2"/>
  <circle cx="16" cy="15.5" r="5.5" fill="#fff"/>
</svg>`;

export interface MapPickerProps {
  value: GeoPoint | null;
  /** A point was chosen: clicked, dragged to, searched for or located. */
  onChange: (point: GeoPoint) => void;
  /** The address OpenStreetMap has for the chosen point, once it arrives (for autofilling fields). */
  onAddressFound?: (result: GeocodeResult) => void;
  error?: string;
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Pick an exact location on an OpenStreetMap map (Leaflet): click or drag the pin, search an
 * address, or use the device's location. Free and keyless: OSM tiles and the Nominatim geocoder.
 * Leaflet touches `window`, so it is loaded in an effect, never during server rendering.
 */
export function MapPicker({ value, onChange, onAddressFound, error }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const placeMarkerRef = useRef<((point: GeoPoint, zoom?: boolean) => void) | null>(null);
  // Latest callbacks, so the map's event handlers (bound once) never call stale ones.
  const onChangeRef = useRef(onChange);
  const onAddressRef = useRef(onAddressFound);
  useEffect(() => {
    onChangeRef.current = onChange;
    onAddressRef.current = onAddressFound;
  });

  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const reverseController = useRef<AbortController | null>(null);

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const start = value ?? DEFAULT_CENTER;
      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
        [start.latitude, start.longitude],
        value ? PICKED_ZOOM : 13,
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const icon = L.divIcon({
        html: PIN_HTML,
        className: '',
        iconSize: [32, 42],
        iconAnchor: [16, 41],
      });

      const resolveAddress = (point: GeoPoint) => {
        reverseController.current?.abort();
        const controller = new AbortController();
        reverseController.current = controller;
        reverseGeocode(point, controller.signal)
          .then((found) => {
            if (!found) return;
            setAddress(found.label);
            onAddressRef.current?.(found);
          })
          .catch(() => {
            // Autofill is a convenience: the pin itself is what gets saved.
          });
      };

      const choose = (point: GeoPoint, zoom = false) => {
        const rounded = { latitude: round(point.latitude), longitude: round(point.longitude) };
        if (markerRef.current) {
          markerRef.current.setLatLng([rounded.latitude, rounded.longitude]);
        } else {
          const marker = L.marker([rounded.latitude, rounded.longitude], { icon, draggable: true });
          marker.on('dragend', () => {
            const { lat, lng } = marker.getLatLng();
            choose({ latitude: lat, longitude: lng });
          });
          markerRef.current = marker.addTo(map);
        }
        if (zoom) map.setView([rounded.latitude, rounded.longitude], PICKED_ZOOM);
        setAddress(null);
        onChangeRef.current(rounded);
        resolveAddress(rounded);
      };
      placeMarkerRef.current = choose;

      map.on('click', (event) =>
        choose({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
      );
      if (value) {
        markerRef.current = L.marker([value.latitude, value.longitude], {
          icon,
          draggable: true,
        }).addTo(map);
        markerRef.current.on('dragend', () => {
          const { lat, lng } = markerRef.current!.getLatLng();
          choose({ latitude: lat, longitude: lng });
        });
      }
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      cancelled = true;
      reverseController.current?.abort();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is built once; later `value` changes come from this component's own handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A cleared form (value -> null) removes the pin.
  useEffect(() => {
    if (value === null && markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
      setAddress(null);
    }
  }, [value]);

  async function runSearch() {
    const text = query.trim();
    if (text.length < 3) {
      setNotice('Type at least 3 characters to search.');
      return;
    }
    setNotice(null);
    setSearching(true);
    try {
      const found = await searchPlaces(text);
      setResults(found);
      if (found.length === 0) setNotice('No matches. Try a nearby landmark, then move the pin.');
    } catch {
      setNotice('Map search is unavailable right now. Click on the map instead.');
    } finally {
      setSearching(false);
    }
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    // Enter searches here instead of submitting the surrounding form.
    if (event.key === 'Enter') {
      event.preventDefault();
      void runSearch();
    }
  }

  function locateMe() {
    if (!('geolocation' in navigator)) {
      setNotice('Your browser cannot share its location. Click on the map instead.');
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        placeMarkerRef.current?.(
          { latitude: position.coords.latitude, longitude: position.coords.longitude },
          true,
        );
      },
      () => {
        setLocating(false);
        setNotice('Could not get your location. Search or click on the map instead.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Search an address or landmark"
          aria-label="Search the map"
          className="h-10 min-w-0 flex-1 rounded-md border border-control bg-surface px-3 text-sm text-ink placeholder:text-muted"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={searching}
          onClick={() => void runSearch()}
        >
          Search
        </Button>
        <Button type="button" variant="ghost" size="sm" loading={locating} onClick={locateMe}>
          Use my location
        </Button>
      </div>

      {results && results.length > 0 && (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {results.map((result) => (
            <li key={`${result.latitude},${result.longitude}`}>
              <button
                type="button"
                onClick={() => {
                  setResults(null);
                  placeMarkerRef.current?.(result, true);
                }}
                className="w-full px-3 py-2 text-left text-sm text-body hover:bg-subtle"
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        className={`relative h-72 overflow-hidden rounded-lg border ${error ? 'border-danger-600' : 'border-line'} sm:h-80`}
      >
        <div ref={containerRef} className="size-full" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-subtle text-sm text-muted">
            Loading map…
          </div>
        )}
      </div>

      <p className="text-sm text-body">
        {value ? (
          <>
            <span className="font-medium text-ink">Pinned:</span> {value.latitude.toFixed(6)},{' '}
            {value.longitude.toFixed(6)}
            {address && <span className="block text-muted">{address}</span>}
          </>
        ) : (
          'Click the map (or search) to drop a pin on the exact entrance. Drag it to fine-tune.'
        )}
      </p>
      {notice && <p className="text-sm text-muted">{notice}</p>}
      {error && <p className="text-sm text-danger-700">{error}</p>}
    </div>
  );
}
