import { Button } from '@/components/ui/button';

export interface ErrorStateProps {
  message: string;
  requestId?: string;
  onRetry?: () => void;
}

/** "Couldn't load this. Check your connection." → Retry, per docs/05-frontend.md §5. */
export function ErrorState({ message, requestId, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-6 py-12 text-center"
    >
      <p className="font-medium text-ink">Couldn&apos;t load this.</p>
      <p className="max-w-sm text-sm text-body">{message}</p>
      {requestId && <p className="text-xs text-muted">Reference: {requestId.slice(0, 8)}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
