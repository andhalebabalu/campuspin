'use client';

import type { PlaceDetail } from '@platform/contracts';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { DAY_NAMES, hoursText } from '../lib/open-status';
import { useIndiaToday } from './open-status-pill';

/** The weekly hours, one line per day (several slots join), today in bold once the browser knows it. */
export function HoursList({ hours }: { hours: PlaceDetail['hours'] }) {
  const today = useIndiaToday();
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {DAY_NAMES.map((dayName, index) => {
        const day = index + 1;
        const rows = hours.filter((hour) => hour.dayOfWeek === day);
        const isToday = today === day;
        return (
          <li
            key={dayName}
            className={`flex justify-between gap-4 rounded-md px-2 py-1 ${isToday ? 'bg-primary-50 font-semibold text-ink' : 'text-body'}`}
          >
            <span>
              {dayName}
              {isToday && <span className="sr-only"> (today)</span>}
            </span>
            <span className="text-right">
              {rows.length === 0 ? 'Not listed' : rows.map(hoursText).join(', ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const km = (meters: number) =>
  meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;

/** Nearby colleges with distances; the signed-in student's own college (if listed) comes first. */
export function NearbyColleges({ colleges }: { colleges: PlaceDetail['nearbyColleges'] }) {
  const { user } = useSession();
  const mine = user?.college?.id ?? null;
  const ordered = [...colleges].sort((a, b) => Number(b.id === mine) - Number(a.id === mine));
  return (
    <ul className="flex flex-col gap-2">
      {ordered.map((college) => (
        <li key={college.id} className="flex items-center justify-between gap-3 text-sm">
          <Link
            href={ROUTES.collegeDetail(college.slug)}
            className="min-w-0 truncate text-ink hover:text-primary-700"
          >
            {college.shortName ?? college.name}
            {college.id === mine && (
              <span className="ml-2 rounded-full bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent-700">
                Your college
              </span>
            )}
          </Link>
          <span className="shrink-0 text-muted">{km(college.distanceMeters)}</span>
        </li>
      ))}
    </ul>
  );
}
