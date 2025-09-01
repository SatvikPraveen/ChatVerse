// apps/web/src/app/providers/SocketProvider.tsx
import React, { createContext, useContext, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { socket } from '../../services/socket';
import type { Message, TypingEvent, PresenceEvent } from '@chatverse/types';

interface SocketContextType {
  isConnected: boolean;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  sendMessage: (conversationId: string, content: string, attachments?: any[]) => void;
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const { user } = useAuthStore();
  const {
    addMessage,
    updateMessage,
    setTypingUsers,
    updateUserPresence,
    isConnected,
    setConnected
  } = useChatStore();

  useEffect(() => {
    if (user) {
      socket.auth = { token: localStorage.getItem('token') };
      socket.connect();

      // Connection events
      socket.on('connect', () => {
        console.log('Socket connected');
        setConnected(true);
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
        setConnected(false);
      });

      // Message events
      socket.on('message:new', (message: Message) => {
        addMessage(message.conversationId, message);
      });

      socket.on('message:updated', (message: Message) => {
        updateMessage(message.conversationId, message);
      });

      // Typing events
      socket.on('typing:start', (data: TypingEvent) => {
        setTypingUsers(data.conversationId, data.userId, true);
      });

      socket.on('typing:stop', (data: TypingEvent) => {
        setTypingUsers(data.conversationId, data.userId, false);
      });

      // Presence events
      socket.on('presence:update', (data: PresenceEvent) => {
        updateUserPresence(data.userId, data.status, data.lastSeen);
      });

      return () => {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('message:new');
        socket.off('message:updated');
        socket.off('typing:start');
        socket.off('typing:stop');
        socket.off('presence:update');
        socket.disconnect();
        setConnected(false);
      };
    }
  }, [user, addMessage, updateMessage, setTypingUsers, updateUserPresence, setConnected]);

  const joinConversation = (conversationId: string) => {
    socket.emit('conversation:join', { conversationId });
  };

  const leaveConversation = (conversationId: string) => {
    socket.emit('conversation:leave', { conversationId });
  };

  const sendMessage = (conversationId: string, content: string, attachments?: any[]) => {
    socket.emit('message:send', { conversationId, content, attachments });
  };

  const startTyping = (conversationId: string) => {
    socket.emit('typing:start', { conversationId });
  };

  const stopTyping = (conversationId: string) => {
    socket.emit('typing:stop', { conversationId });
  };

  const value: SocketContextType = {
    isConnected,
    joinConversation,
    leaveConversation,
    sendMessage,
    startTyping,
    stopTyping,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}
