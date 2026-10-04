import { RotateCw, Trash2 } from 'lucide-react';
import { discardPending, retryPending } from '@/lib/messaging';
import { formatTime } from '@/lib/time';
import type { PendingMessage } from '@/stores/messages';
import { ReceiptTicks } from './ReceiptTicks';

/** An optimistic message that has not been acknowledged by the server yet. */
export function PendingItem({ pending }: { pending: PendingMessage }) {
  return (
    <li className="flex justify-end px-4">
      <div className="max-w-[75%]">
        <div className="rounded-2xl rounded-br-md bg-bubble-own px-3 py-2 text-sm opacity-80 shadow-sm">
          <p className="whitespace-pre-wrap break-words">{pending.text}</p>
          <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted">
            <time dateTime={pending.createdAt}>{formatTime(pending.createdAt)}</time>
            <ReceiptTicks pending={pending.status} />
          </span>
        </div>
        {pending.status === 'failed' && (
          <p className="mt-1 flex items-center justify-end gap-2 text-xs text-danger">
            <span>{pending.error ?? 'Not sent'}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 underline"
              onClick={() => void retryPending(pending.clientMsgId)}
            >
              <RotateCw size={12} /> Retry
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 underline"
              onClick={() => void discardPending(pending.clientMsgId)}
            >
              <Trash2 size={12} /> Discard
            </button>
          </p>
        )}
      </div>
    </li>
  );
}
