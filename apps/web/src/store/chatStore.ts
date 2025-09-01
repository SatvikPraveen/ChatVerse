// apps/web/src/store/chatStore.ts
import { create } from 'zustand';
import type { Message, Conversation, User } from '@chatverse/types';

interface ChatState {
  conversations: Record<string, Conversation>;
  messages: Record<string, Message[]>;
  users: Record<string, User>;
  typingUsers: Record<string, Record<string, boolean>>;
  isConnected: boolean;
  activeConversationId: string | null;

  setConnected: (connected: boolean) => void;
  setActiveConversation: (conversationId: string | null) => void;

  addConversation: (conversation: Conversation) => void;
  updateConversation: (conversation: Conversation) => void;

  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, message: Message) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;

  setTypingUsers: (conversationId: string, userId: string, isTyping: boolean) => void;
  updateUserPresence: (userId: string, status: string, lastSeen?: Date) => void;

  addUser: (user: User) => void;
  updateUser: (user: User) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: {},
  messages: {},
  users: {},
  typingUsers: {},
  isConnected: false,
  activeConversationId: null,

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  setActiveConversation: (conversationId: string | null) =>
    set({ activeConversationId: conversationId }),

  addConversation: (conversation: Conversation) =>
    set(state => ({
      conversations: {
        ...state.conversations,
        [conversation.id]: conversation
      }
    })),

  updateConversation: (conversation: Conversation) =>
    set(state => ({
      conversations: {
        ...state.conversations,
        [conversation.id]: { ...state.conversations[conversation.id], ...conversation }
      }
    })),

  addMessage: (conversationId: string, message: Message) =>
    set(state => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] || []), message]
      }
    })),

  updateMessage: (conversationId: string, message: Message) =>
    set(state => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).map(m =>
          m.id === message.id ? message : m
        )
      }
    })),

  deleteMessage: (conversationId: string, messageId: string) =>
    set(state => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).filter(m => m.id !== messageId)
      }
    })),

  setMessages: (conversationId: string, messages: Message[]) =>
    set(state => ({
      messages: {
        ...state.messages,
        [conversationId]: messages
      }
    })),

  setTypingUsers: (conversationId: string, userId: string, isTyping: boolean) =>
    set(state => ({
      typingUsers: {
        ...state.typingUsers,
        [conversationId]: {
          ...state.typingUsers[conversationId],
          [userId]: isTyping
        }
      }
    })),

  updateUserPresence: (userId: string, status: string, lastSeen?: Date) =>
    set(state => ({
      users: {
        ...state.users,
        [userId]: {
          ...state.users[userId],
          presence: { status, lastSeen }
        }
      }
    })),

  addUser: (user: User) =>
    set(state => ({
      users: {
        ...state.users,
        [user.id]: user
      }
    })),

  updateUser: (user: User) =>
    set(state => ({
      users: {
        ...state.users,
        [user.id]: { ...state.users[user.id], ...user }
      }
    })),
}));
