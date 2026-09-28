'use client';

import type { PlaceServices } from '@platform/contracts';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/shared/skeleton';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { servicesService } from '@/services/services.service';
import { MealLines } from './menu-card';

/**
 * What a student can use at this place through CampusPin: its live services and, for a mess,
 * today's and tomorrow's menu. Renders nothing when the place offers no services.
 */
export function PlaceServicesSection({ placeSlug }: { placeSlug: string }) {
  const [data, setData] = useState<PlaceServices | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    servicesService
      .placeServices(placeSlug, controller.signal)
      .then((result) => setData(result.data))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [placeSlug]);

  if (failed) return null;
  if (!data) return <Skeleton className="h-40 w-full" />;
  if (data.services.length === 0) return null;

  const hasMenu = data.services.some((service) => service.kind === 'DAILY_MENU');

  return (
    <section className="flex flex-col gap-4" aria-labelledby="services-heading">
      <h2 id="services-heading" className="text-xl font-semibold text-ink">
        Use {data.name} on CampusPin
      </h2>

      {hasMenu && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-3 p-5">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <Icon name="utensils" className="size-5 text-accent-600" />
              Today&apos;s menu
            </p>
            {data.menus.today ? (
              <MealLines menu={data.menus.today} />
            ) : (
              <p className="text-sm text-body">
                Today&apos;s menu isn&apos;t out yet. Save this mess to hear when it is.
              </p>
            )}
          </Card>
          {data.menus.tomorrow && (
            <Card className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <Icon name="calendar" className="size-5 text-primary-700" />
                Tomorrow&apos;s menu
              </p>
              <MealLines menu={data.menus.tomorrow} />
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
