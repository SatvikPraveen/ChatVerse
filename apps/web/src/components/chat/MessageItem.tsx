import type { Conversation, Message } from '@chatverse/protocol';
import clsx from 'clsx';
import { CornerUpLeft, Pencil, SmilePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { deleteMessage, toggleReaction } from '@/lib/messaging';
import { receiptLevel } from '@/lib/receipt-level';
import { formatTime } from '@/lib/time';
import { useMessagesStore, type DecryptStatus } from '@/stores/messages';
import { useUiStore } from '@/stores/ui';
import { displayNameOf, useUsersStore } from '@/stores/users';
import { Avatar } from '../ui/Avatar';
import { ReceiptTicks } from './ReceiptTicks';

const QUICK_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

function placeholderFor(status: DecryptStatus | undefined): string {
  switch (status) {
    case 'waiting-keys':
      return '🔑 Waiting for encryption keys…';
    case 'other-device':
      return '🔒 Encrypted for another device';
    case 'failed':
      return '⚠️ Could not decrypt this message';
    default:
      return '🔒 Encrypted message';
  }
}

export function MessageItem({
  message,
  conversation,
  myUserId,
  showSender,
}: {
  message: Message;
  conversation: Conversation;
  myUserId: string;
  showSender: boolean;
}) {
  const users = useUsersStore((s) => s.byId);
  const plaintext = useMessagesStore((s) => s.plaintext[message.id]);
  const decrypt = useMessagesStore((s) => s.decrypt[message.id]);
  const replyTarget = useMessagesStore((s) =>
    message.replyTo ? s.conversations[message.conversationId]?.byId[message.replyTo] : undefined,
  );
  const replyPlain = useMessagesStore((s) =>
    message.replyTo ? s.plaintext[message.replyTo] : undefined,
  );
  const setReplyTo = useUiStore((s) => s.setReplyTo);
  const setEditing = useUiStore((s) => s.setEditing);
  const [pickerOpen, setPickerOpen] = useState(false);

  const own = message.senderId === myUserId;
  const text = message.deletedAt
    ? 'This message was deleted'
    : message.kind === 'encrypted'
      ? (plaintext ?? placeholderFor(decrypt))
      : (message.text ?? `[${message.kind}]`);
  const muted =
    message.deletedAt !== null || (message.kind === 'encrypted' && plaintext === undefined);

  return (
    <li className={clsx('group flex items-end gap-2 px-4', own ? 'justify-end' : 'justify-start')}>
      {!own && (
        <span className="w-8 shrink-0">
          {showSender && (
            <Avatar
              name={displayNameOf(users, message.senderId)}
              src={users[message.senderId]?.avatarUrl}
              size="sm"
            />
          )}
        </span>
      )}
      <div className={clsx('relative max-w-[75%]', own && 'order-first')}>
        {showSender && !own && conversation.kind === 'group' && (
          <p className="mb-0.5 ml-1 text-[11px] font-medium text-muted">
            {displayNameOf(users, message.senderId)}
          </p>
        )}
        <div
          className={clsx(
            'rounded-2xl px-3 py-2 text-sm shadow-sm',
            own ? 'rounded-br-md bg-bubble-own' : 'rounded-bl-md bg-bubble',
            muted && 'italic text-muted',
          )}
        >
          {replyTarget && (
            <blockquote className="mb-1 border-l-2 border-accent/60 pl-2 text-xs text-muted">
              <span className="font-medium">{displayNameOf(users, replyTarget.senderId)}: </span>
              {replyTarget.kind === 'encrypted' ? (replyPlain ?? '🔒') : (replyTarget.text ?? '')}
            </blockquote>
          )}
          <p className="whitespace-pre-wrap break-words" data-testid="message-text">
            {text}
          </p>
          <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted">
            {message.editedAt && <span>edited</span>}
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            {own && <ReceiptTicks level={receiptLevel(conversation, message.seq, myUserId)} />}
          </span>
        </div>
        {message.reactions.length > 0 && (
          <ul className={clsx('mt-1 flex flex-wrap gap-1', own && 'justify-end')}>
            {message.reactions.map((r) => (
              <li key={r.emoji}>
                <button
                  type="button"
                  className={clsx(
                    'rounded-full border px-1.5 py-0.5 text-xs',
                    r.userIds.includes(myUserId)
                      ? 'border-accent bg-accent/15'
                      : 'border-border bg-surface',
                  )}
                  onClick={() => void toggleReaction(message, r.emoji)}
                  title={r.userIds.map((id) => displayNameOf(users, id)).join(', ')}
                >
                  {r.emoji} {r.userIds.length}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!message.deletedAt && (
          <div
            className={clsx(
              'absolute -top-3 flex items-center gap-0.5 rounded-full border border-border bg-surface px-1 opacity-0 shadow-sm transition focus-within:opacity-100 group-hover:opacity-100',
              own ? 'left-0' : 'right-0',
            )}
          >
            <button
              type="button"
              className="rounded-full p-1 hover:bg-surface-2"
              onClick={() => setPickerOpen((o) => !o)}
              aria-label="React"
            >
              <SmilePlus size={14} />
            </button>
            <button
              type="button"
              className="rounded-full p-1 hover:bg-surface-2"
              onClick={() => setReplyTo(message.conversationId, message.id)}
              aria-label="Reply"
            >
              <CornerUpLeft size={14} />
            </button>
            {own && (message.kind !== 'encrypted' || plaintext !== undefined) && (
              <button
                type="button"
                className="rounded-full p-1 hover:bg-surface-2"
                onClick={() => setEditing(message.conversationId, message.id)}
                aria-label="Edit"
              >
                <Pencil size={14} />
              </button>
            )}
            {own && (
              <button
                type="button"
                className="rounded-full p-1 text-danger hover:bg-surface-2"
                onClick={() => void deleteMessage(message)}
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
        {pickerOpen && (
          <div
            className={clsx(
              'absolute z-10 mt-1 flex gap-1 rounded-full border border-border bg-surface px-2 py-1 shadow-lg',
              own ? 'right-0' : 'left-0',
            )}
            role="menu"
          >
            {QUICK_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-full p-1 text-base hover:bg-surface-2"
                onClick={() => {
                  setPickerOpen(false);
                  void toggleReaction(message, e);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
