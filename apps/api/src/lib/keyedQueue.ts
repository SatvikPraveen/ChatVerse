/**
 * Serialises asynchronous work per key while letting different keys run concurrently.
 *
 * Used to make the "allocate seq → persist → emit" section of a message send atomic per
 * conversation on this node, so that broadcasts leave in sequence order. Without it two sends to
 * the same conversation can be allocated seq 5 and 6 but complete (and emit) in the order 6, 5.
 *
 * Entries are removed as soon as their chain drains, so idle keys cost nothing.
 */
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  get size(): number {
    return this.tails.size;
  }

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    // Chain on settlement (not success) so one failed task never blocks the next one.
    const next = previous.then(task, task);
    const tracked = next.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tracked);
    tracked.finally(() => {
      if (this.tails.get(key) === tracked) this.tails.delete(key);
    });
    return next;
  }
}
