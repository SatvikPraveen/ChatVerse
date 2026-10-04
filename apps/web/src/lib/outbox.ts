import type { EncryptedPayload, Message, MessageKind, MessageSendInput } from '@chatverse/protocol';
import { ApiClientError } from './api';
import { SocketNotConnectedError } from './socket';
import type { KeyValueStore } from './storage';

/**
 * Durable outbox for at-least-once message delivery.
 *
 * Every send is first appended here (IndexedDB), then flushed. Because each item carries a
 * client-generated `clientMsgId` and the server deduplicates on it, re-sending after a crash,
 * reload or reconnect can never create duplicates. Items are flushed strictly in order per
 * conversation so that sender-key distribution control messages precede the message that needs
 * them. Transient failures back off exponentially; permanent (4xx) failures mark the item
 * `failed` for the user to retry explicitly.
 */

export interface OutboxItem {
  clientMsgId: string;
  conversationId: string;
  kind: Exclude<MessageKind, 'system'>;
  /** Plaintext kept until an encrypted payload exists (encryption may need the network). */
  text?: string;
  encrypted?: EncryptedPayload;
  replyTo?: string;
  /** Whether this is a crypto control message (never shown in the UI). */
  control: boolean;
  attempts: number;
  nextAttemptAt: number;
  createdAt: string;
}

export interface OutboxDeps {
  storage: KeyValueStore;
  userId: string;
  send(input: MessageSendInput): Promise<Message>;
  /** Produce the encrypted payload for a deferred item; may throw when offline. */
  encrypt?(item: OutboxItem): Promise<EncryptedPayload>;
  onSent?(item: OutboxItem, message: Message): void;
  onFailed?(item: OutboxItem, error: Error): void;
  onRetryScheduled?(item: OutboxItem, delayMs: number): void;
  now?(): number;
}

const MAX_BACKOFF_MS = 30_000;

export function backoffMs(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.max(0, attempt - 1));
}

export class Outbox {
  private items: OutboxItem[] = [];
  private loaded = false;
  private flushing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: OutboxDeps) {}

  private get key(): string {
    return `cv:outbox:${this.deps.userId}`;
  }

  async load(): Promise<OutboxItem[]> {
    if (!this.loaded) {
      this.items = (await this.deps.storage.get<OutboxItem[]>(this.key)) ?? [];
      this.loaded = true;
    }
    return this.items;
  }

  private persist(): Promise<void> {
    return this.deps.storage.set(this.key, this.items);
  }

  async enqueue(item: Omit<OutboxItem, 'attempts' | 'nextAttemptAt' | 'createdAt'>): Promise<OutboxItem> {
    await this.load();
    const full: OutboxItem = { ...item, attempts: 0, nextAttemptAt: 0, createdAt: new Date().toISOString() };
    this.items.push(full);
    await this.persist();
    return full;
  }

  async remove(clientMsgId: string): Promise<void> {
    await this.load();
    this.items = this.items.filter((i) => i.clientMsgId !== clientMsgId);
    await this.persist();
  }

  /** Reset an item's backoff so the next flush retries it immediately. */
  async retryNow(clientMsgId: string): Promise<void> {
    await this.load();
    const item = this.items.find((i) => i.clientMsgId === clientMsgId);
    if (item) {
      item.attempts = 0;
      item.nextAttemptAt = 0;
      await this.persist();
    }
    void this.flush();
  }

  pending(): OutboxItem[] {
    return [...this.items];
  }

  /** Try to deliver everything that is due. Safe to call often; concurrent calls coalesce. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.flushInternal().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async flushInternal(): Promise<void> {
    await this.load();
    const now = this.deps.now?.() ?? Date.now();
    // Conversations whose earlier item is blocked must not have later items sent out of order.
    const blocked = new Set<string>();
    for (const item of [...this.items]) {
      if (blocked.has(item.conversationId)) continue;
      if (item.nextAttemptAt > now) {
        blocked.add(item.conversationId);
        continue;
      }
      try {
        if (!item.encrypted && item.kind === 'encrypted') {
          if (!this.deps.encrypt) throw new Error('no encryptor configured');
          item.encrypted = await this.deps.encrypt(item);
          await this.persist();
        }
        const input: MessageSendInput = { conversationId: item.conversationId, clientMsgId: item.clientMsgId, kind: item.kind };
        if (item.kind === 'encrypted') input.encrypted = item.encrypted;
        else if (item.text !== undefined) input.text = item.text;
        if (item.replyTo) input.replyTo = item.replyTo;
        const message = await this.deps.send(input);
        this.items = this.items.filter((i) => i.clientMsgId !== item.clientMsgId);
        await this.persist();
        this.deps.onSent?.(item, message);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        blocked.add(item.conversationId);
        if (error instanceof ApiClientError && error.isPermanent) {
          this.items = this.items.filter((i) => i.clientMsgId !== item.clientMsgId);
          await this.persist();
          this.deps.onFailed?.(item, error);
          continue;
        }
        item.attempts += 1;
        const delay = backoffMs(item.attempts);
        item.nextAttemptAt = now + delay;
        await this.persist();
        this.deps.onRetryScheduled?.(item, delay);
        if (!(error instanceof SocketNotConnectedError)) this.scheduleRetry(delay);
      }
    }
    // Something still due later: make sure a retry happens even without a reconnect signal.
    const next = this.items.reduce((min, i) => Math.min(min, i.nextAttemptAt), Infinity);
    if (Number.isFinite(next)) this.scheduleRetry(Math.max(0, next - now));
  }

  private scheduleRetry(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
