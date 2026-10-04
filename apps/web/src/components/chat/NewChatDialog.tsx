import type { PublicUser } from '@chatverse/protocol';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiClientError } from '@/lib/api';
import { api } from '@/lib/session';
import { useConversationsStore } from '@/stores/conversations';
import { useUiStore } from '@/stores/ui';
import { useUsersStore } from '@/stores/users';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';

export function NewChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useUiStore((s) => s.toast);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [selected, setSelected] = useState<PublicUser[]>([]);
  const [name, setName] = useState('');
  const [encrypted, setEncrypted] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelected([]);
      setName('');
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api.users
        .search(query.trim())
        .then((users) => {
          if (!ctrl.signal.aborted) setResults(users);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query]);

  const isGroup = selected.length > 1;

  async function create() {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const conversation = await api.conversations.create({
        kind: isGroup ? 'group' : 'direct',
        participantIds: selected.map((u) => u.id),
        ...(isGroup
          ? {
              name:
                name.trim() ||
                selected
                  .map((u) => u.displayName)
                  .join(', ')
                  .slice(0, 100),
            }
          : {}),
        encrypted,
      });
      useUsersStore.getState().upsertMany(selected);
      useConversationsStore.getState().upsert(conversation);
      onClose();
      navigate(`/app/c/${conversation.id}`);
    } catch (err) {
      toast('error', err instanceof ApiClientError ? err.message : 'Could not create conversation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New conversation">
      <label className="block text-xs font-medium text-muted" htmlFor="user-search">
        Find people
      </label>
      <input
        id="user-search"
        className="input mt-1"
        placeholder="Search by name or username"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {selected.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1" aria-label="Selected participants">
          {selected.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent hover:bg-accent/25"
                onClick={() => setSelected((s) => s.filter((x) => x.id !== u.id))}
              >
                {u.displayName} ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-2 max-h-48 overflow-y-auto" role="listbox" aria-label="Search results">
        {results
          .filter((u) => !selected.some((s) => s.id === u.id))
          .map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                onClick={() => setSelected((s) => [...s, u])}
              >
                <Avatar name={u.displayName} src={u.avatarUrl} size="sm" />
                <span className="text-sm">{u.displayName}</span>
                <span className="text-xs text-muted">@{u.username}</span>
              </button>
            </li>
          ))}
      </ul>
      {isGroup && (
        <input
          className="input mt-3"
          placeholder="Group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
      )}
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={encrypted}
          onChange={(e) => setEncrypted(e.target.checked)}
        />
        End-to-end encrypted
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={selected.length === 0 || busy}
          onClick={create}
        >
          {isGroup ? 'Create group' : 'Start chat'}
        </button>
      </div>
    </Modal>
  );
}
