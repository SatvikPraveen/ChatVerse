import type { Message } from '@chatverse/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { highestSeq, lowestSeq, useMessagesStore } from './messages';

function msg(seq: number, overrides: Partial<Message> = {}): Message {
  return {
    id: `m${seq}`,
    conversationId: 'c1',
    seq,
    clientMsgId: `client-${seq}`,
    senderId: 'alice',
    kind: 'text',
    text: `text ${seq}`,
    encrypted: null,
    attachments: [],
    replyTo: null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    hlc: '0',
    createdAt: new Date(seq * 1000).toISOString(),
    updatedAt: new Date(seq * 1000).toISOString(),
    ...overrides,
  };
}

describe('messages store', () => {
  beforeEach(() => useMessagesStore.getState().reset());

  it('orders by seq regardless of insertion order and dedupes by id', () => {
    const s = useMessagesStore.getState();
    s.upsert(msg(3));
    s.upsert(msg(1));
    s.upsertMany('c1', [msg(2), msg(3, { text: 'edited' })]);
    const conv = useMessagesStore.getState().conversations.c1!;
    expect(conv.order).toEqual(['m1', 'm2', 'm3']);
    expect(conv.byId.m3?.text).toBe('edited');
    expect(highestSeq(useMessagesStore.getState(), 'c1')).toBe(3);
    expect(lowestSeq(useMessagesStore.getState(), 'c1')).toBe(1);
  });

  it('replaces the optimistic pending message when the server echo arrives and keeps its plaintext', () => {
    const s = useMessagesStore.getState();
    s.addPending({
      clientMsgId: 'client-7',
      conversationId: 'c1',
      senderId: 'alice',
      kind: 'encrypted',
      text: 'secret plaintext',
      replyTo: null,
      createdAt: new Date().toISOString(),
      status: 'sending',
    });
    expect(Object.keys(useMessagesStore.getState().pending)).toEqual(['client-7']);
    s.upsert(
      msg(7, {
        kind: 'encrypted',
        text: null,
        encrypted: { v: 1, suite: 'x', header: 'a', ciphertext: 'b' },
      }),
    );
    const state = useMessagesStore.getState();
    expect(state.pending).toEqual({});
    expect(state.plaintext.m7).toBe('secret plaintext');
  });

  it('does not resolve a pending message that belongs to a different sender', () => {
    const s = useMessagesStore.getState();
    s.addPending({
      clientMsgId: 'client-1',
      conversationId: 'c1',
      senderId: 'bob',
      kind: 'text',
      text: 'x',
      replyTo: null,
      createdAt: new Date().toISOString(),
      status: 'queued',
    });
    s.upsert(msg(1));
    expect(Object.keys(useMessagesStore.getState().pending)).toEqual(['client-1']);
  });

  it('tracks pending status transitions and decrypt placeholders', () => {
    const s = useMessagesStore.getState();
    s.addPending({
      clientMsgId: 'k',
      conversationId: 'c1',
      senderId: 'alice',
      kind: 'text',
      text: 'x',
      replyTo: null,
      createdAt: new Date().toISOString(),
      status: 'sending',
    });
    s.setPendingStatus('k', 'failed', 'boom');
    expect(useMessagesStore.getState().pending.k).toMatchObject({
      status: 'failed',
      error: 'boom',
    });
    s.setDecryptStatus('m1', 'waiting-keys');
    expect(useMessagesStore.getState().decrypt.m1).toBe('waiting-keys');
    s.setPlaintext('m1', 'now readable');
    expect(useMessagesStore.getState().decrypt.m1).toBeUndefined();
    expect(useMessagesStore.getState().plaintext.m1).toBe('now readable');
  });
});
