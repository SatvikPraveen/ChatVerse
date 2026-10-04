import type { Conversation, PublicUser } from '@chatverse/protocol';

/** Display title of a conversation: the group name, or the other participant's name. */
export function conversationTitle(
  conversation: Conversation,
  users: Record<string, PublicUser>,
  myUserId: string,
): string {
  if (conversation.kind === 'group') return conversation.name ?? 'Group';
  const other = conversation.participants.find((p) => p.userId !== myUserId);
  if (!other) return 'Just you';
  const u = users[other.userId];
  return u?.displayName ?? u?.username ?? '…';
}

export function peerUserId(conversation: Conversation, myUserId: string): string | null {
  if (conversation.kind !== 'direct') return null;
  return conversation.participants.find((p) => p.userId !== myUserId)?.userId ?? null;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
