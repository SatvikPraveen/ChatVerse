import clsx from 'clsx';
import { X } from 'lucide-react';
import { useUiStore } from '@/stores/ui';

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={clsx(
            'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg',
            t.kind === 'error' && 'border-danger/40 bg-surface text-danger',
            t.kind === 'success' && 'border-success/40 bg-surface text-success',
            t.kind === 'info' && 'border-border bg-surface text-text',
          )}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            className="text-muted hover:text-text"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
