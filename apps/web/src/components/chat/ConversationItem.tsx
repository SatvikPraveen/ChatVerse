import type { Conversation } from '@chatverse/protocol';
import clsx from 'clsx';
import { Lock, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { conversationTitle, peerUserId } from '@/lib/conversation-title';
import { formatListTime } from '@/lib/time';
import { unreadCount } from '@/stores/conversations';
import { useMessagesStore } from '@/stores/messages';
import { usePresenceStore } from '@/stores/presence';
import { useUsersStore } from '@/stores/users';
import { Avatar } from '../ui/Avatar';

export function ConversationItem({ conversation, myUserId }: { conversation: Conversation; myUserId: string }) {
  const users = useUsersStore((s) => s.byId);
  const peer = peerUserId(conversation, myUserId);
  const presence = usePresenceStore((s) => (peer ? s.byUserId[peer] : undefined));
  const lastPlain = useMessagesStore((s) => (conversation.lastMessage ? s.plaintext[conversation.lastMessage.id] : undefined));
  const title = conversationTitle(conversation, users, myUserId);
  const unread = unreadCount(conversation, myUserId);
  const last = conversation.lastMessage;
  const previewText = last
    ? last.kind === 'encrypted'
      ? (lastPlain ?? '🔒 Encrypted message')
      : (last.text ?? `[${last.kind}]`)
    : 'No messages yet';

  return (
    <NavLink
      to={`/app/c/${conversation.id}`}
      className={({ isActive }) =>
        clsx('flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-surface-2', isActive && 'bg-surface-2')
      }
    >
      <Avatar name={title} src={conversation.avatarUrl} online={peer ? presence?.status === 'online' : undefined} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-sm font-medium">{title}</span>
          {conversation.kind === 'group' && <Users size={12} className="shrink-0 text-muted" />}
          {conversation.encrypted && <Lock size={12} className="shrink-0 text-muted" aria-label="End-to-end encrypted" />}
          {last && <span className="ml-auto shrink-0 text-[11px] text-muted">{formatListTime(last.createdAt)}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className={clsx('truncate text-xs', unread > 0 ? 'font-medium text-text' : 'text-muted')}>{previewText}</span>
          {unread > 0 && (
            <span className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </span>
      </span>
    </NavLink>
  );
}
