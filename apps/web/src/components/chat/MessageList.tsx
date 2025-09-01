// apps/web/src/components/chat/MessageList.tsx
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../hooks/useAuth';
import { apiClient } from '../../services/apiClient';
import MessageItem from './MessageItem';
import TypingIndicator from './TypingIndicator';
import LoadingSpinner from '../common/LoadingSpinner';
import type { Message } from '@chatverse/types';

interface MessageListProps {
  conversationId: string;
}

export default function MessageList({ conversationId }: MessageListProps) {
  const { user } = useAuth();
  const { messages, typingUsers } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

  const conversationMessages = messages[conversationId] || [];
  const typingUsersList = Object.keys(typingUsers[conversationId] || {})
    .filter(userId => typingUsers[conversationId][userId] && userId !== user?.id);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam }) =>
      apiClient.get(`/messages/${conversationId}?cursor=${pageParam || ''}&limit=50`),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined,
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldScrollToBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationMessages.length, shouldScrollToBottom]);

  // Auto-scroll logic
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollHeight - scrollTop <= clientHeight + 100;
    setShouldScrollToBottom(isNearBottom);

    // Load more messages when scrolled to top
    if (scrollTop === 0 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-2 space-y-4"
      onScroll={handleScroll}
    >
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <LoadingSpinner size="sm" />
        </div>
      )}

      {conversationMessages.map((message, index) => {
        const prevMessage = conversationMessages[index - 1];
        const showAvatar = !prevMessage || prevMessage.senderId !== message.senderId;
        const showTimestamp = !prevMessage ||
          new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime() > 300000; // 5 minutes

        return (
          <MessageItem
            key={message.id}
            message={message}
            showAvatar={showAvatar}
            showTimestamp={showTimestamp}
            isOwn={message.senderId === user?.id}
          />
        );
      })}

      {typingUsersList.length > 0 && (
        <TypingIndicator userIds={typingUsersList} />
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
