import { MessageSquare } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { ChatView } from '@/components/chat/ChatView';

export function ChatPage() {
  const { conversationId } = useParams();
  if (!conversationId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
        <MessageSquare size={40} />
        <p className="text-sm">Select a conversation or start a new one.</p>
      </div>
    );
  }
  return <ChatView conversationId={conversationId} />;
}
