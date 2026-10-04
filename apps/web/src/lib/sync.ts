import type { Message, SyncPullResult } from '@chatverse/protocol';

/**
 * Gap detection and catch-up.
 *
 * Every conversation has dense sequence numbers (1, 2, 3, ...). The synchroniser tracks, per
 * conversation, the highest seq we hold *contiguously*. A live `message:new` whose seq is not
 * exactly `known + 1` reveals a gap (a dropped socket event, a message delivered while we were
 * reconnecting); we then pull `afterSeq = known` until the server reports no more, which yields
 * the missing messages in order. Pulls are single-flight per conversation and live messages
 * that arrive during a pull are simply re-applied (upserts are idempotent).
 */

export interface SyncDeps {
  pull(conversationId: string, afterSeq: number, limit: number): Promise<SyncPullResult>;
  apply(conversationId: string, messages: Message[]): void | Promise<void>;
  limit?: number;
}

export type IncomingOutcome = 'applied' | 'duplicate' | 'gap-filled';

export class Synchronizer {
  private known = new Map<string, number>();
  private inflight = new Map<string, Promise<void>>();
  private readonly limit: number;

  constructor(private readonly deps: SyncDeps) {
    this.limit = deps.limit ?? 100;
  }

  /** Record that we hold everything up to and including `seq` for a conversation. */
  setKnown(conversationId: string, seq: number): void {
    this.known.set(conversationId, Math.max(seq, this.known.get(conversationId) ?? 0));
  }

  getKnown(conversationId: string): number {
    return this.known.get(conversationId) ?? 0;
  }

  forget(conversationId: string): void {
    this.known.delete(conversationId);
  }

  trackedConversations(): string[] {
    return [...this.known.keys()];
  }

  /** Handle a live message. Resolves once the message (and any gap before it) is applied. */
  async onIncoming(message: Message): Promise<IncomingOutcome> {
    const { conversationId, seq } = message;
    if (!this.known.has(conversationId)) {
      // Not tracked yet (conversation never opened): nothing to compare against.
      await this.deps.apply(conversationId, [message]);
      return 'applied';
    }
    const known = this.getKnown(conversationId);
    if (seq <= known) {
      await this.deps.apply(conversationId, [message]); // may carry an edit; harmless
      return 'duplicate';
    }
    if (seq === known + 1) {
      await this.deps.apply(conversationId, [message]);
      this.setKnown(conversationId, seq);
      return 'applied';
    }
    await this.catchUp(conversationId);
    // The pull normally includes `message`; apply anyway in case it raced ahead of the server.
    await this.deps.apply(conversationId, [message]);
    this.setKnown(conversationId, seq);
    return 'gap-filled';
  }

  /** Pull everything after the known watermark until the server says we are caught up. */
  catchUp(conversationId: string): Promise<void> {
    const existing = this.inflight.get(conversationId);
    if (existing) return existing;
    const run = (async () => {
      for (let i = 0; i < 1_000; i++) {
        const after = this.getKnown(conversationId);
        const page = await this.deps.pull(conversationId, after, this.limit);
        if (page.messages.length > 0) {
          await this.deps.apply(conversationId, page.messages);
          const last = page.messages[page.messages.length - 1]!;
          this.setKnown(conversationId, last.seq);
        }
        if (!page.hasMore) {
          // Nothing more to fetch: we hold everything up to the head.
          this.setKnown(conversationId, page.headSeq);
          return;
        }
      }
    })().finally(() => this.inflight.delete(conversationId));
    this.inflight.set(conversationId, run);
    return run;
  }

  /** After a reconnect, catch up every tracked conversation. */
  async resumeAll(): Promise<void> {
    await Promise.all(
      this.trackedConversations().map((id) => this.catchUp(id).catch(() => undefined)),
    );
  }
}
