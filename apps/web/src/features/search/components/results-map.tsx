'use client';

import 'leaflet/dist/leaflet.css';
import type { PlaceCard } from '@platform/contracts';
import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useRef } from 'react';
import { ROUTES } from '@/constants/routes';

const pin = (
  fill: string,
) => `<svg width="28" height="37" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1Z" fill="${fill}" stroke="#fff" stroke-width="2"/>
  <circle cx="16" cy="15.5" r="5.5" fill="#fff"/>
</svg>`;

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

/**
 * The current page of results on an OpenStreetMap map: one pin per place (green when verified),
 * each opening a popup that links to the place. The map fits itself to the pins.
 */
export function ResultsMap({ places }: { places: PlaceCard[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;
      mapRef.current?.remove();
      const map = L.map(containerRef.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const points: Array<[number, number]> = [];
      for (const place of places) {
        const at: [number, number] = [place.latitude, place.longitude];
        points.push(at);
        L.marker(at, {
          icon: L.divIcon({
            html: pin(place.verified ? '#1f7a2e' : '#0b63cf'),
            className: '',
            iconSize: [28, 37],
            iconAnchor: [14, 36],
            popupAnchor: [0, -32],
          }),
          title: place.name,
        })
          .bindPopup(
            `<a href="${ROUTES.placeDetail(place.slug)}" style="font-weight:700;color:#052f63">${escapeHtml(place.name)}</a><br/><span style="color:#4f586b">${escapeHtml(place.primaryCategory?.name ?? '')}${place.primaryCategory ? ' · ' : ''}${escapeHtml(place.city)}</span>`,
          )
          .addTo(map);
      }
      if (points.length > 0) map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
      else map.setView([19.0952, 74.7496], 12);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [places]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Map of the places found"
      className="z-0 h-[32rem] w-full overflow-hidden rounded-2xl border border-line"
    />
  );
}
