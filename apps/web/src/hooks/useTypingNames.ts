import { useEffect, useState } from 'react';
import { typingUserIds, useTypingStore } from '@/stores/typing';
import { displayNameOf, useUsersStore } from '@/stores/users';

/** Names of users currently typing in a conversation; re-evaluates every second so entries expire. */
export function useTypingNames(conversationId: string): string[] {
  const byConversation = useTypingStore((s) => s.byConversation);
  const users = useUsersStore((s) => s.byId);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(t);
  }, []);
  return typingUserIds(byConversation, conversationId).map((id) => displayNameOf(users, id));
}
