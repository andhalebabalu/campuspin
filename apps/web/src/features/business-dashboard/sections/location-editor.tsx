'use client';

import { ApiClientError } from '@platform/api-client';
import { updateOwnedPlaceRequestSchema, type OwnedPlace } from '@platform/contracts';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { MapPicker } from '@/components/shared/map-picker';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { businessService } from '@/services/business.service';
import { PlaceScope } from '../place-scope';
import { SaveBar, useLeaveGuard } from '../unsaved';
import { Panel } from './overview';

interface Values {
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
}

const valuesOf = (place: OwnedPlace): Values => ({
  address: place.address,
  city: place.city,
  state: place.state,
  latitude: place.latitude,
  longitude: place.longitude,
  googleMapsUrl: place.googleMapsUrl ?? '',
});

function LocationForm({
  place,
  setPlace,
}: {
  place: OwnedPlace;
  setPlace: (place: OwnedPlace) => void;
}) {
  const toast = useToast();
  const baseline = useMemo(() => valuesOf(place), [place]);
  const [values, setValues] = useState<Values>(baseline);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  useLeaveGuard(dirty);

  async function save() {
    const body: Record<string, unknown> = {};
    for (const key of Object.keys(values) as Array<keyof Values>) {
      if (values[key] === baseline[key]) continue;
      body[key] =
        key === 'googleMapsUrl' && values.googleMapsUrl.trim() === '' ? null : values[key];
    }
    const parsed = updateOwnedPlaceRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      setPlace((await businessService.updatePlace(place.id, parsed.data)).data);
      toast.show('Location saved. Nearby colleges are updated too.');
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors) {
        setErrors(firstFieldErrors(caught.fieldErrors));
      } else {
        toast.show(caught instanceof ApiClientError ? caught.message : 'Could not save.', 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  const set = (key: 'address' | 'city' | 'state' | 'googleMapsUrl') => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel title="Pin on the map">
          <MapPicker
            value={{ latitude: values.latitude, longitude: values.longitude }}
            onChange={(point) =>
              setValues((current) => ({
                ...current,
                latitude: point.latitude,
                longitude: point.longitude,
              }))
            }
            error={errors.latitude}
          />
          <p className="mt-2 text-xs text-muted">
            Drag the pin to your exact entrance: Directions and “near your college” use it.
          </p>
        </Panel>
        <Panel title="Address">
          <div className="flex flex-col gap-4">
            <Input
              label="Street address"
              value={values.address}
              onChange={(e) => set('address')(e.target.value)}
              error={errors.address}
            />
            <Input
              label="City"
              value={values.city}
              onChange={(e) => set('city')(e.target.value)}
              error={errors.city}
            />
            <Input
              label="State"
              value={values.state}
              onChange={(e) => set('state')(e.target.value)}
              error={errors.state}
            />
            <Input
              label="Google Maps link (optional)"
              type="url"
              placeholder="https://maps.app.goo.gl/…"
              value={values.googleMapsUrl}
              onChange={(e) => set('googleMapsUrl')(e.target.value)}
              error={errors.googleMapsUrl}
              hint="If set, Directions opens this link."
            />
          </div>
        </Panel>
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => {
          setValues(baseline);
          setErrors({});
        }}
      />
    </>
  );
}

export function LocationEditor() {
  return (
    <>
      <PageHeader
        title="Location"
        description="Where students find you. Moving the pin recalculates your nearby colleges."
      />
      <PlaceScope>
        {(place, setPlace) => <LocationForm place={place} setPlace={setPlace} />}
      </PlaceScope>
    </>
  );
}
