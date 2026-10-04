import type { Message, SyncPullResult } from '@chatverse/protocol';
import { describe, expect, it, vi } from 'vitest';
import { Synchronizer } from './sync';

function msg(seq: number, conversationId = 'c1'): Message {
  return {
    id: `m${seq}`,
    conversationId,
    seq,
    clientMsgId: `cm${seq}`,
    senderId: 'bob',
    kind: 'text',
    text: `t${seq}`,
    encrypted: null,
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

/** A fake server holding messages 1..head for c1, paging `limit` at a time. */
function fakeServer(head: number) {
  const pull = vi.fn(async (_c: string, afterSeq: number, limit: number): Promise<SyncPullResult> => {
    const messages: Message[] = [];
    for (let s = afterSeq + 1; s <= Math.min(head, afterSeq + limit); s++) messages.push(msg(s));
    const last = messages[messages.length - 1]?.seq ?? afterSeq;
    return { messages, headSeq: head, hasMore: last < head };
  });
  return pull;
}

describe('Synchronizer', () => {
  it('applies contiguous messages without pulling', async () => {
    const pull = fakeServer(10);
    const applied: number[] = [];
    const sync = new Synchronizer({ pull, apply: (_c, ms) => void applied.push(...ms.map((m) => m.seq)) });
    sync.setKnown('c1', 3);
    expect(await sync.onIncoming(msg(4))).toBe('applied');
    expect(await sync.onIncoming(msg(5))).toBe('applied');
    expect(await sync.onIncoming(msg(5))).toBe('duplicate');
    expect(pull).not.toHaveBeenCalled();
    expect(applied).toEqual([4, 5, 5]);
    expect(sync.getKnown('c1')).toBe(5);
  });

  it('detects a gap and fills it in order across multiple pages', async () => {
    const pull = fakeServer(12);
    const applied: number[] = [];
    const sync = new Synchronizer({ pull, apply: (_c, ms) => void applied.push(...ms.map((m) => m.seq)), limit: 4 });
    sync.setKnown('c1', 2);
    expect(await sync.onIncoming(msg(12))).toBe('gap-filled');
    // 3..12 pulled in three pages of 4, then the live message re-applied
    expect(applied).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12]);
    expect(pull.mock.calls.map((c) => c[1])).toEqual([2, 6, 10]);
    expect(sync.getKnown('c1')).toBe(12);
  });

  it('coalesces concurrent catch-ups for the same conversation', async () => {
    const pull = fakeServer(5);
    const sync = new Synchronizer({ pull, apply: () => undefined });
    sync.setKnown('c1', 0);
    await Promise.all([sync.catchUp('c1'), sync.catchUp('c1'), sync.onIncoming(msg(5))]);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(sync.getKnown('c1')).toBe(5);
  });

  it('resumeAll catches up every tracked conversation and advances to headSeq', async () => {
    const pull = vi.fn(async (c: string, afterSeq: number): Promise<SyncPullResult> => {
      const head = c === 'c1' ? 3 : 7;
      const messages: Message[] = [];
      for (let s = afterSeq + 1; s <= head; s++) messages.push(msg(s, c));
      return { messages, headSeq: head, hasMore: false };
    });
    const apply = vi.fn();
    const sync = new Synchronizer({ pull, apply });
    sync.setKnown('c1', 3);
    sync.setKnown('c2', 4);
    await sync.resumeAll();
    expect(pull).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledWith('c2', [msg(5, 'c2'), msg(6, 'c2'), msg(7, 'c2')]);
    expect(sync.getKnown('c1')).toBe(3);
    expect(sync.getKnown('c2')).toBe(7);
  });

  it('applies messages for untracked conversations without pulling', async () => {
    const pull = fakeServer(3);
    const apply = vi.fn();
    const sync = new Synchronizer({ pull, apply });
    expect(await sync.onIncoming(msg(3, 'new'))).toBe('applied');
    expect(pull).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledOnce();
  });
});
