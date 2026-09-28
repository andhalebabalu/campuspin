'use client';

import { ApiClientError } from '@platform/api-client';
import type { ProfileVisibility, Settings } from '@platform/contracts';
import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { FormAlert } from '@/components/ui/form-alert';
import { studentsService } from '@/services/students.service';

const CARD = 'rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6';

const VISIBILITY: Array<{ value: ProfileVisibility; label: string; hint: string }> = [
  {
    value: 'STUDENTS',
    label: 'Verified students',
    hint: 'Only verified students see your course and year.',
  },
  { value: 'PUBLIC', label: 'Everyone', hint: 'Anyone can see your course and year.' },
  {
    value: 'PRIVATE',
    label: 'Only me',
    hint: 'Others see just your first name, initial and badge.',
  },
];

type Toggle = Exclude<keyof Settings, 'profileVisibility'>;

const PRIVACY_TOGGLES: Array<[Toggle, string, string]> = [
  [
    'showCommunityActivity',
    'Show my community activity',
    'Your posts appear on your profile to other students.',
  ],
  [
    'allowMarketplaceMessages',
    'Let buyers message me',
    'Buyers can message you about your listings in CampusPin. Your phone and email are never shown.',
  ],
];

const NOTIFY_TOGGLES: Array<[Toggle, string]> = [
  ['notifyCommunity', 'Comments and replies on my posts'],
  ['notifyEvents', 'College events'],
  ['notifyJobs', 'Jobs and internships'],
  ['notifyMarketplace', 'Marketplace activity'],
  ['notifyMessages', 'New messages'],
  ['notifyPlaceUpdates', 'Menus from places I saved'],
];

/** Privacy and notification switches; each change saves at once. */
export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    studentsService
      .settings(controller.signal)
      .then((result) => setSettings(result.data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load settings.');
      });
    return () => controller.abort();
  }, [reload]);

  async function change(patch: Partial<Settings>) {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, ...patch });
    setSaveError(null);
    try {
      setSettings((await studentsService.updateSettings(patch)).data);
    } catch (caught) {
      setSettings(before);
      setSaveError(
        caught instanceof ApiClientError ? caught.message : 'Could not save that change.',
      );
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />;
  if (!settings) return <Skeleton className="h-96 w-full" />;

  const toggle = (key: Toggle, label: string, hint?: string) => (
    <label key={key} className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={settings[key]}
        onChange={(event) => void change({ [key]: event.target.checked })}
        className="mt-1 size-5 shrink-0 accent-accent-600"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      {saveError && <FormAlert message={saveError} />}
      <section className={CARD}>
        <h2 className="text-lg font-bold text-ink">Profile visibility</h2>
        <p className="mb-4 text-sm text-muted">
          Your email, phone and student ID are never shown to anyone.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {VISIBILITY.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 ${
                settings.profileVisibility === option.value
                  ? 'border-action bg-primary-50'
                  : 'border-line'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input
                  type="radio"
                  name="visibility"
                  checked={settings.profileVisibility === option.value}
                  onChange={() => void change({ profileVisibility: option.value })}
                  className="accent-accent-600"
                />
                {option.label}
              </span>
              <span className="text-xs text-muted">{option.hint}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 divide-y divide-line">
          {PRIVACY_TOGGLES.map(([key, label, hint]) => toggle(key, label, hint))}
        </div>
      </section>
      <section className={CARD}>
        <h2 className="text-lg font-bold text-ink">Notify me about</h2>
        <p className="mb-2 text-sm text-muted">
          Account notices (like your verification result) always arrive.
        </p>
        <div className="divide-y divide-line">
          {NOTIFY_TOGGLES.map(([key, label]) => toggle(key, label))}
        </div>
      </section>
    </div>
  );
}
