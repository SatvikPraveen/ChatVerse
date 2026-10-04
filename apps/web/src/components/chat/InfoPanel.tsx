import type { Conversation } from '@chatverse/protocol';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiClientError } from '@/lib/api';
import { conversationTitle, peerUserId } from '@/lib/conversation-title';
import { api, getRuntime } from '@/lib/session';
import { useConversationsStore } from '@/stores/conversations';
import { usePresenceStore } from '@/stores/presence';
import { useUiStore } from '@/stores/ui';
import { displayNameOf, useUsersStore } from '@/stores/users';
import { Avatar } from '../ui/Avatar';

export function InfoPanel({
  conversation,
  myUserId,
}: {
  conversation: Conversation;
  myUserId: string;
}) {
  const users = useUsersStore((s) => s.byId);
  const presence = usePresenceStore((s) => s.byUserId);
  const close = useUiStore((s) => s.setInfoPanelOpen);
  const toast = useUiStore((s) => s.toast);
  const navigate = useNavigate();
  const peer = peerUserId(conversation, myUserId);
  const [safety, setSafety] = useState<string | null>(null);
  const title = conversationTitle(conversation, users, myUserId);
  const me = conversation.participants.find((p) => p.userId === myUserId);
  const canManage = conversation.kind === 'group' && (me?.role === 'owner' || me?.role === 'admin');

  useEffect(() => {
    if (!peer || !conversation.encrypted) return;
    setSafety(getRuntime()?.e2ee.safetyNumberWith(peer) ?? null);
  }, [peer, conversation.encrypted, conversation.headSeq]);

  async function leave() {
    if (!confirm('Leave this conversation?')) return;
    try {
      await api.conversations.leave(conversation.id);
      useConversationsStore.getState().remove(conversation.id);
      navigate('/app');
    } catch (err) {
      toast('error', err instanceof ApiClientError ? err.message : 'Could not leave');
    }
  }

  async function remove(userId: string) {
    try {
      const updated = await api.conversations.removeParticipant(conversation.id, userId);
      useConversationsStore.getState().upsert(updated);
    } catch (err) {
      toast('error', err instanceof ApiClientError ? err.message : 'Could not remove member');
    }
  }

  return (
    <aside
      className="flex w-full flex-col border-l border-border bg-surface md:w-80"
      aria-label="Conversation info"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold">Details</h2>
        <button
          type="button"
          className="btn-ghost p-1"
          onClick={() => close(false)}
          aria-label="Close details"
        >
          <X size={18} />
        </button>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar name={title} src={conversation.avatarUrl} size="lg" />
          <p className="font-semibold">{title}</p>
          {conversation.topic && <p className="text-xs text-muted">{conversation.topic}</p>}
          <p className="text-xs text-muted">
            {conversation.encrypted ? '🔒 End-to-end encrypted' : 'Not encrypted'}
          </p>
        </div>

        {peer && conversation.encrypted && (
          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Safety number
            </h3>
            <p className="mt-1 text-xs text-muted">
              Compare this number with {displayNameOf(users, peer)} out of band. If it matches,
              nobody is intercepting your messages.
            </p>
            <p className="mt-2 break-words rounded-lg bg-surface-2 p-2 font-mono text-xs leading-relaxed">
              {safety ?? 'Available after the first encrypted message.'}
            </p>
          </section>
        )}

        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Members ({conversation.participants.length})
          </h3>
          <ul className="mt-2 space-y-1">
            {conversation.participants.map((p) => (
              <li key={p.userId} className="flex items-center gap-2 text-sm">
                <Avatar
                  name={displayNameOf(users, p.userId)}
                  src={users[p.userId]?.avatarUrl}
                  size="sm"
                  online={presence[p.userId]?.status === 'online'}
                />
                <span className="truncate">
                  {p.userId === myUserId ? 'You' : displayNameOf(users, p.userId)}
                </span>
                <span className="ml-auto text-[11px] text-muted">{p.role}</span>
                {canManage && p.userId !== myUserId && p.role !== 'owner' && (
                  <button
                    type="button"
                    className="text-xs text-danger underline"
                    onClick={() => void remove(p.userId)}
                  >
                    remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {conversation.kind === 'group' && (
          <button type="button" className="btn-danger mt-6 w-full" onClick={() => void leave()}>
            Leave group
          </button>
        )}
      </div>
    </aside>
  );
}
