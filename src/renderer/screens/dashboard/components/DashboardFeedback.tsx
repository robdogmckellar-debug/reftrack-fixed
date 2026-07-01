import type { JSX } from 'preact';

import { CheckIcon, ClipboardIcon, RefreshIcon, TrashIcon } from '../../../components/icons';
import { Button } from '../../../design-system/Button';

export type DashboardToastTone = 'copy' | 'success' | 'info' | 'danger';

export interface DashboardToast {
  id: string;
  tone: DashboardToastTone;
  title: string;
  message?: string | undefined;
}

export interface DashboardUndo {
  message: string;
  pending: boolean;
  onUndo(): void;
}

function ToastIcon({ tone }: { tone: DashboardToastTone }): JSX.Element {
  switch (tone) {
    case 'copy':
      return <ClipboardIcon size={17} />;
    case 'success':
      return <CheckIcon size={17} />;
    case 'danger':
      return <TrashIcon size={17} />;
    case 'info':
      return <RefreshIcon size={17} />;
  }
}

export function DashboardToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: readonly DashboardToast[];
  onDismiss(id: string): void;
}): JSX.Element {
  return (
    <div
      class="dashboard-toast-region"
      role="status"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Dashboard notifications"
    >
      {toasts.map((toast) => (
        <div key={toast.id} class={`dashboard-toast dashboard-toast--${toast.tone}`}>
          <span class="dashboard-toast__icon" aria-hidden="true">
            <ToastIcon tone={toast.tone} />
          </span>
          <span class="dashboard-toast__copy">
            <strong>{toast.title}</strong>
            {toast.message ? <span>{toast.message}</span> : null}
          </span>
          <button
            type="button"
            class="dashboard-toast__dismiss"
            aria-label={`Dismiss ${toast.title}`}
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function DashboardUndoBar({ undo }: { undo: DashboardUndo | null }): JSX.Element | null {
  if (!undo) return null;

  return (
    <div class="dashboard-undo" role="status" aria-live="polite">
      <span>{undo.message}</span>
      <Button variant="quiet" size="small" pending={undo.pending} onClick={undo.onUndo}>
        Undo
      </Button>
    </div>
  );
}
