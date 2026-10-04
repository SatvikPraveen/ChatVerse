import type { Conversation } from '@chatverse/protocol';
import { LIMITS } from '@chatverse/protocol';
import { Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { editMessage, sendText, setTyping } from '@/lib/messaging';
import { useMessagesStore } from '@/stores/messages';
import { useUiStore } from '@/stores/ui';
import { displayNameOf, useUsersStore } from '@/stores/users';

export function Composer({ conversation }: { conversation: Conversation }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const typingStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyToId = useUiStore((s) => s.replyTo[conversation.id] ?? null);
  const editingId = useUiStore((s) => s.editing[conversation.id] ?? null);
  const setReplyTo = useUiStore((s) => s.setReplyTo);
  const setEditing = useUiStore((s) => s.setEditing);
  const toast = useUiStore((s) => s.toast);
  const users = useUsersStore((s) => s.byId);
  const replyTarget = useMessagesStore((s) =>
    replyToId ? s.conversations[conversation.id]?.byId[replyToId] : undefined,
  );
  const editTarget = useMessagesStore((s) =>
    editingId ? s.conversations[conversation.id]?.byId[editingId] : undefined,
  );
  const editPlain = useMessagesStore((s) => (editingId ? s.plaintext[editingId] : undefined));

  // Entering edit mode loads the current text into the box.
  useEffect(() => {
    if (editTarget) {
      setValue(editTarget.kind === 'encrypted' ? (editPlain ?? '') : (editTarget.text ?? ''));
      textarea.current?.focus();
    }
  }, [editTarget, editPlain]);

  useEffect(() => {
    textarea.current?.focus();
    return () => {
      if (typingStop.current) clearTimeout(typingStop.current);
    };
  }, [conversation.id]);

  function onChange(next: string) {
    setValue(next);
    if (!editTarget) {
      setTyping(conversation.id, next.length > 0);
      if (typingStop.current) clearTimeout(typingStop.current);
      typingStop.current = setTimeout(() => setTyping(conversation.id, false), 3_000);
    }
    const el = textarea.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }

  async function submit() {
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      if (editTarget) {
        await editMessage(editTarget, text);
        setEditing(conversation.id, null);
      } else {
        setTyping(conversation.id, false);
        await sendText(conversation.id, text, replyToId);
        setReplyTo(conversation.id, null);
      }
      setValue('');
      if (textarea.current) textarea.current.style.height = 'auto';
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not send');
    } finally {
      setBusy(false);
      textarea.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      setEditing(conversation.id, null);
      setReplyTo(conversation.id, null);
      if (editTarget) setValue('');
    }
  }

  return (
    <form
      className="border-t border-border bg-surface px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {(replyTarget || editTarget) && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-xs">
          <span className="truncate text-muted">
            {editTarget
              ? 'Editing message'
              : `Replying to ${displayNameOf(users, replyTarget!.senderId)}`}
          </span>
          <button
            type="button"
            className="ml-auto text-muted hover:text-text"
            aria-label="Cancel"
            onClick={() => {
              setEditing(conversation.id, null);
              setReplyTo(conversation.id, null);
              if (editTarget) setValue('');
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textarea}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={LIMITS.MESSAGE_TEXT_MAX}
          placeholder={
            conversation.encrypted
              ? 'Encrypted message… (Enter to send, Shift+Enter for a new line)'
              : 'Message… (Enter to send)'
          }
          aria-label="Message"
          className="input max-h-40 resize-none"
        />
        <button
          type="submit"
          className="btn-primary h-10 w-10 shrink-0 p-0"
          disabled={!value.trim() || busy}
          aria-label={editTarget ? 'Save' : 'Send'}
        >
          <Send size={18} />
        </button>
      </div>
    </form>
  );
}
