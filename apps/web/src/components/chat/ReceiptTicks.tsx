import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import type { ReceiptLevel } from '@/lib/receipt-level';
import type { PendingStatus } from '@/stores/messages';

export function ReceiptTicks({ level, pending }: { level?: ReceiptLevel; pending?: PendingStatus }) {
  if (pending === 'failed') return <AlertCircle size={13} className="text-danger" aria-label="Failed to send" />;
  if (pending) return <Clock size={12} className="text-muted" aria-label={pending === 'queued' ? 'Queued' : 'Sending'} />;
  if (level === 'read') return <CheckCheck size={14} className="text-accent" aria-label="Read" />;
  if (level === 'delivered') return <CheckCheck size={14} className="text-muted" aria-label="Delivered" />;
  return <Check size={14} className="text-muted" aria-label="Sent" />;
}
