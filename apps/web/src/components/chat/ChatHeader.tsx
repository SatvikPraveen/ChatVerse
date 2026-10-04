import type { Conversation } from '@chatverse/protocol';
import { ArrowLeft, Info, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { conversationTitle, peerUserId } from '@/lib/conversation-title';
import { formatLastSeen } from '@/lib/time';
import { usePresenceStore } from '@/stores/presence';
import { useUiStore } from '@/stores/ui';
import { useUsersStore } from '@/stores/users';
import { useTypingNames } from '@/hooks/useTypingNames';
import { Avatar } from '../ui/Avatar';

export function ChatHeader({ conversation, myUserId }: { conversation: Conversation; myUserId: string }) {
  const users = useUsersStore((s) => s.byId);
  const peer = peerUserId(conversation, myUserId);
  const presence = usePresenceStore((s) => (peer ? s.byUserId[peer] : undefined));
  const infoOpen = useUiStore((s) => s.infoPanelOpen);
  const setInfoOpen = useUiStore((s) => s.setInfoPanelOpen);
  const typing = useTypingNames(conversation.id);
  const title = conversationTitle(conversation, users, myUserId);

  const subtitle =
    typing.length > 0
      ? typing.length === 1
        ? `${typing[0]} is typing…`
        : 'Several people are typing…'
      : conversation.kind === 'group'
        ? `${conversation.participants.length} members`
        : presence
          ? presence.status === 'online'
            ? 'Online'
            : presence.status === 'offline'
              ? `Last seen ${formatLastSeen(presence.lastSeen)}`
              : presence.status[0]!.toUpperCase() + presence.status.slice(1)
          : '';

  return (
    <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2">
      <Link to="/app" className="btn-ghost p-2 md:hidden" aria-label="Back to conversations">
        <ArrowLeft size={18} />
      </Link>
      <Avatar name={title} src={conversation.avatarUrl} online={peer ? presence?.status === 'online' : undefined} />
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-1 truncate text-sm font-semibold">
          {title}
          {conversation.encrypted && <Lock size={12} className="text-muted" aria-label="End-to-end encrypted" />}
        </h1>
        <p className="truncate text-xs text-muted" aria-live="polite">
          {subtitle}
        </p>
      </div>
      <button type="button" className="btn-ghost p-2" onClick={() => setInfoOpen(!infoOpen)} aria-label="Conversation info" aria-pressed={infoOpen}>
        <Info size={18} />
      </button>
    </header>
  );
}
