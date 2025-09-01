// apps/web/src/components/chat/ChatView.tsx
import React from 'react';
import MessageList from './MessageList';
import Composer from './Composer';
import LoadingSpinner from '../common/LoadingSpinner';
import { useChatStore } from '../../store/chatStore';

interface ChatViewProps {
  conversationId: string;
}

export default function ChatView({ conversationId }: ChatViewProps) {
  const { conversations, isConnected } = useChatStore();
  const conversation = conversations[conversationId];

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Connection status banner */}
      {!isConnected && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
          <p className="text-sm text-yellow-700 text-center">
            Reconnecting... Some features may be limited.
          </p>
        </div>
      )}

      {/* Messages */}
      <MessageList conversationId={conversationId} />

      {/* Message composer */}
      <Composer conversationId={conversationId} />
    </div>
  );
}
