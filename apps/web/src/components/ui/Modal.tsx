import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Accessible dialog: focus trap via <dialog>, Escape closes, backdrop click closes. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="card w-full max-w-md p-0 backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <button type="button" className="btn-ghost p-1" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="p-4">{open && children}</div>
    </dialog>
  );
}
