'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useRef } from 'react';

const PIN_HTML = `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1Z" fill="#0b63cf" stroke="#fff" stroke-width="2"/>
  <circle cx="16" cy="15.5" r="5.5" fill="#fff"/>
</svg>`;

/**
 * A read-only OpenStreetMap map with the place's pin. Leaflet (and the tiles) load only once the
 * map scrolls near the screen, so a visitor who never reaches the Location section downloads none.
 */
export function PlaceMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const build = () => {
      void import('leaflet').then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current, {
          scrollWheelZoom: false,
          dragging: !L.Browser.mobile,
          zoomControl: true,
        }).setView([latitude, longitude], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        L.marker([latitude, longitude], {
          icon: L.divIcon({
            html: PIN_HTML,
            className: '',
            iconSize: [32, 42],
            iconAnchor: [16, 41],
          }),
          title: label,
          keyboard: false,
        }).addTo(map);
        mapRef.current = map;
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          build();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(container);
    return () => {
      cancelled = true;
      observer.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, label]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Map showing ${label}`}
      className="relative z-0 h-64 w-full overflow-hidden rounded-xl bg-subtle sm:h-72"
    />
  );
}
