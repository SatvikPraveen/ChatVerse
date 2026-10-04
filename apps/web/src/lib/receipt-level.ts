import type { Conversation } from '@chatverse/protocol';

export type ReceiptLevel = 'sent' | 'delivered' | 'read';

/**
 * Derive the receipt level of an own message from the other participants' watermarks:
 * read when everyone has read past it, delivered when at least one device received it.
 */
export function receiptLevel(conversation: Conversation, seq: number, myUserId: string): ReceiptLevel {
  const others = conversation.participants.filter((p) => p.userId !== myUserId);
  if (others.length === 0) return 'read';
  if (others.every((p) => p.lastReadSeq >= seq)) return 'read';
  if (others.some((p) => p.lastDeliveredSeq >= seq || p.lastReadSeq >= seq)) return 'delivered';
  return 'sent';
}
