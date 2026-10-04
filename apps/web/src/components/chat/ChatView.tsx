import { useEffect } from 'react';
import { openConversation } from '@/lib/messaging';
import { useAuthStore } from '@/stores/auth';
import { useConversationsStore } from '@/stores/conversations';
import { useUiStore } from '@/stores/ui';
import { Spinner } from '../ui/Spinner';
import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { InfoPanel } from './InfoPanel';
import { MessageList } from './MessageList';
import { TypingIndicator } from './TypingIndicator';

export function ChatView({ conversationId }: { conversationId: string }) {
  const user = useAuthStore((s) => s.user);
  const conversation = useConversationsStore((s) => s.byId[conversationId]);
  const loaded = useConversationsStore((s) => s.loaded);
  const infoOpen = useUiStore((s) => s.infoPanelOpen);
  const toast = useUiStore((s) => s.toast);

  useEffect(() => {
    openConversation(conversationId).catch((err: unknown) => toast('error', err instanceof Error ? err.message : 'Could not open conversation'));
  }, [conversationId, toast]);

  if (!user) return null;
  if (!conversation) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        {loaded ? 'Conversation not found.' : <Spinner />}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Messages">
        <ChatHeader conversation={conversation} myUserId={user.id} />
        <MessageList conversation={conversation} myUserId={user.id} />
        <TypingIndicator conversationId={conversation.id} />
        <Composer conversation={conversation} />
      </section>
      {infoOpen && <InfoPanel conversation={conversation} myUserId={user.id} />}
    </div>
  );
}
