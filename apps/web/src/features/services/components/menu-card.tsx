'use client';

import type { DailyMenu, MessMenuCard as MessMenuCardData } from '@platform/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { distanceLabel, mealLines } from '../lib/service-meta';
import { SavePlaceButton } from './save-place-button';

/** The dishes of one day, one line per meal. */
export function MealLines({ menu }: { menu: DailyMenu }) {
  return (
    <dl className="flex flex-col gap-2.5">
      {mealLines(menu.meals).map((line) => (
        <div key={line.label}>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{line.label}</dt>
          <dd className="text-sm text-ink">{line.dishes}</dd>
        </div>
      ))}
      {menu.note && <p className="text-sm text-body italic">{menu.note}</p>}
    </dl>
  );
}

/** A mess with today's menu, and tomorrow's behind a switch when it is out. */
export function MessMenuCard({ card }: { card: MessMenuCardData }) {
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const menu = day === 'today' ? card.today : card.tomorrow;
  const distance = distanceLabel(card.place.distanceMeters);

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={ROUTES.placeDetail(card.place.slug)}
            className="font-semibold text-ink hover:text-primary-800"
          >
            {card.place.name}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-body">
            {card.place.ratingCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Icon name="star" className="size-3.5 fill-amber-600 text-amber-600" />
                {card.place.ratingAverage.toFixed(1)}
              </span>
            )}
            {distance && (
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" className="size-3.5" />
                {distance}
              </span>
            )}
          </p>
        </div>
        <SavePlaceButton placeId={card.place.id} initialSaved={card.saved} compact />
      </div>

      {card.tomorrow && (
        <div
          role="tablist"
          className="flex w-fit gap-1 rounded-full bg-subtle p-1 text-xs font-semibold"
        >
          {(['today', 'tomorrow'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={day === option}
              onClick={() => setDay(option)}
              className={`rounded-full px-3 py-1 capitalize ${
                day === option ? 'bg-surface text-ink shadow-xs' : 'text-muted'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {menu && <MealLines menu={menu} />}
    </Card>
  );
}
