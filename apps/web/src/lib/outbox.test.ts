import type { Message, MessageSendInput } from '@chatverse/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './api';
import { Outbox, backoffMs } from './outbox';
import { SocketNotConnectedError } from './socket';
import { memoryStore } from './storage';

function echo(input: MessageSendInput): Message {
  return {
    id: `id-${input.clientMsgId}`,
    conversationId: input.conversationId,
    seq: 1,
    clientMsgId: input.clientMsgId,
    senderId: 'me',
    kind: input.kind,
    text: input.text ?? null,
    encrypted: input.encrypted ?? null,
    attachments: [],
    replyTo: null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    hlc: '0',
    createdAt: '',
    updatedAt: '',
  };
}

describe('Outbox', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps items while offline and delivers them in order on flush, surviving a reload', async () => {
    const storage = memoryStore();
    let online = false;
    const sent: string[] = [];
    const send = vi.fn(async (input: MessageSendInput) => {
      if (!online) throw new SocketNotConnectedError();
      sent.push(input.clientMsgId);
      return echo(input);
    });
    const outbox = new Outbox({ storage, userId: 'me', send });
    await outbox.enqueue({ clientMsgId: 'a', conversationId: 'c1', kind: 'text', text: 'first', control: false });
    await outbox.enqueue({ clientMsgId: 'b', conversationId: 'c1', kind: 'text', text: 'second', control: false });
    await outbox.flush();
    expect(sent).toEqual([]);
    expect(outbox.pending()).toHaveLength(2);

    // "reload": a fresh Outbox over the same storage
    online = true;
    const reloaded = new Outbox({ storage, userId: 'me', send, now: () => Date.now() + 60_000 });
    await reloaded.flush();
    expect(sent).toEqual(['a', 'b']);
    expect(reloaded.pending()).toEqual([]);
  });

  it('drops permanently failing items and keeps later items of other conversations flowing', async () => {
    const onFailed = vi.fn();
    const send = vi.fn(async (input: MessageSendInput) => {
      if (input.clientMsgId === 'bad') throw new ApiClientError('NOT_A_PARTICIPANT', 'nope', 403);
      return echo(input);
    });
    const outbox = new Outbox({ storage: memoryStore(), userId: 'me', send, onFailed });
    await outbox.enqueue({ clientMsgId: 'bad', conversationId: 'c1', kind: 'text', text: 'x', control: false });
    await outbox.enqueue({ clientMsgId: 'after-bad', conversationId: 'c1', kind: 'text', text: 'y', control: false });
    await outbox.enqueue({ clientMsgId: 'other', conversationId: 'c2', kind: 'text', text: 'z', control: false });
    await outbox.flush();
    expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({ clientMsgId: 'bad' }), expect.any(ApiClientError));
    expect(send.mock.calls.map((c) => c[0].clientMsgId)).toEqual(['bad', 'other']);
    // the item behind the failure is sent on the next flush
    await outbox.flush();
    expect(send.mock.calls.map((c) => c[0].clientMsgId)).toEqual(['bad', 'other', 'after-bad']);
  });

  it('backs off exponentially on transient errors and retries automatically', async () => {
    let failures = 2;
    const send = vi.fn(async (input: MessageSendInput) => {
      if (failures-- > 0) throw new ApiClientError('SERVICE_UNAVAILABLE', 'down', 503);
      return echo(input);
    });
    const outbox = new Outbox({ storage: memoryStore(), userId: 'me', send });
    await outbox.enqueue({ clientMsgId: 'k', conversationId: 'c1', kind: 'text', text: 'x', control: false });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(backoffMs(1));
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(backoffMs(2));
    expect(send).toHaveBeenCalledTimes(3);
    expect(outbox.pending()).toEqual([]);
    outbox.dispose();
  });

  it('encrypts deferred items at flush time', async () => {
    const encrypt = vi.fn(async () => ({ v: 1 as const, suite: 's', header: 'h', ciphertext: 'c' }));
    const send = vi.fn(async (input: MessageSendInput) => echo(input));
    const outbox = new Outbox({ storage: memoryStore(), userId: 'me', send, encrypt });
    await outbox.enqueue({ clientMsgId: 'e', conversationId: 'c1', kind: 'encrypted', text: 'secret', control: false });
    await outbox.flush();
    expect(encrypt).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toMatchObject({ kind: 'encrypted', encrypted: { suite: 's' } });
    expect(send.mock.calls[0]?.[0].text).toBeUndefined();
  });
});
