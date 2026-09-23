import type { ReactNode } from 'react';

export interface FormAlertProps {
  message: string;
  requestId?: string;
  children?: ReactNode;
}

/** A form-level error banner. Field-level errors live under their own input instead. */
export function FormAlert({ message, requestId, children }: FormAlertProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-md border border-danger-600/20 bg-danger-50 px-4 py-3 text-sm text-danger-700"
    >
      <p>{message}</p>
      {children}
      {requestId && (
        <p className="text-xs text-danger-700/70">Reference: {requestId.slice(0, 8)}</p>
      )}
    </div>
  );
}
