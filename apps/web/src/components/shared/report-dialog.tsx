'use client';

import { REPORT_REASON_LABELS, type ReportReason } from '@platform/contracts';
import { ApiClientError } from '@platform/api-client';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * "Report this": pick a reason, optionally say more. Shared by community posts, comments and
 * marketplace listings; each passes the reasons that make sense for it.
 */
export function ReportDialog<T extends ReportReason>({
  open,
  title,
  reasons,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  reasons: readonly T[];
  onSubmit: (report: { reason: T; description?: string }) => Promise<unknown>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const detailsId = useId();
  const [reason, setReason] = useState<T | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function reset() {
    setReason(null);
    setDetails('');
    setDone(false);
    setProblem(null);
  }

  async function submit() {
    if (!reason) {
      setProblem('Pick a reason.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await onSubmit({ reason, ...(details.trim() ? { description: details.trim() } : {}) });
      setDone(true);
    } catch (caught) {
      setProblem(caught instanceof ApiClientError ? caught.message : 'Could not send the report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={() => {
        reset();
        onClose();
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold">{done ? 'Thanks for telling us' : title}</h2>
          {done ? (
            <>
              <p className="text-sm text-body">
                A moderator will look at it. The person you reported is not told who reported them.
              </p>
              <Button className="self-end" onClick={() => ref.current?.close()}>
                Done
              </Button>
            </>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">What is wrong?</legend>
                {reasons.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="report-reason"
                      checked={reason === value}
                      onChange={() => setReason(value)}
                      className="accent-accent-600"
                    />
                    {REPORT_REASON_LABELS[value]}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={detailsId} className="text-sm font-medium">
                  More details (optional)
                </label>
                <textarea
                  id={detailsId}
                  rows={3}
                  maxLength={1000}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  className="rounded-md border border-control bg-surface px-3 py-2 text-sm"
                />
              </div>
              {problem && <p className="text-sm text-danger-700">{problem}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => ref.current?.close()}>
                  Cancel
                </Button>
                <Button variant="danger" loading={busy} onClick={() => void submit()}>
                  Send report
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
