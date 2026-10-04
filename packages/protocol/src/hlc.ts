/**
 * Hybrid Logical Clock (Kulkarni et al., 2014).
 *
 * An HLC timestamp is (wallMs, counter, nodeId). It is always close to physical time while
 * still respecting causality: if event A happened-before B then hlc(A) < hlc(B), even when the
 * wall clocks of the two nodes disagree. We use it to give messages a total order that is
 * consistent across conversations and server nodes, which per-conversation sequence numbers
 * alone cannot provide.
 *
 * Timestamps are encoded as fixed-width strings so that lexicographic order equals logical
 * order and they can be indexed as plain strings in any database.
 */

export interface HlcTimestamp {
  wallMs: number;
  counter: number;
  nodeId: string;
}

const WALL_WIDTH = 15; // enough until year ~33000
const COUNTER_WIDTH = 6; // 16^6 = 16.7M events per millisecond per node
const COUNTER_MAX = 16 ** COUNTER_WIDTH - 1;
/** Reject remote timestamps too far in the future to protect against clock poisoning. */
export const HLC_MAX_DRIFT_MS = 60_000;

export class HlcDriftError extends Error {
  constructor(public readonly driftMs: number) {
    super(`HLC remote timestamp drifts ${driftMs}ms ahead of local clock`);
    this.name = 'HlcDriftError';
  }
}

export function encodeHlc(ts: HlcTimestamp): string {
  return (
    ts.wallMs.toString(16).padStart(WALL_WIDTH, '0') +
    '-' +
    ts.counter.toString(16).padStart(COUNTER_WIDTH, '0') +
    '-' +
    ts.nodeId
  );
}

export function decodeHlc(encoded: string): HlcTimestamp {
  const first = encoded.indexOf('-');
  const second = encoded.indexOf('-', first + 1);
  if (first !== WALL_WIDTH || second !== WALL_WIDTH + 1 + COUNTER_WIDTH) {
    throw new Error(`Malformed HLC timestamp: ${encoded}`);
  }
  const wallMs = parseInt(encoded.slice(0, first), 16);
  const counter = parseInt(encoded.slice(first + 1, second), 16);
  const nodeId = encoded.slice(second + 1);
  if (!Number.isFinite(wallMs) || !Number.isFinite(counter) || nodeId.length === 0) {
    throw new Error(`Malformed HLC timestamp: ${encoded}`);
  }
  return { wallMs, counter, nodeId };
}

export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class HybridLogicalClock {
  private wallMs = 0;
  private counter = 0;

  constructor(
    public readonly nodeId: string,
    private readonly now: () => number = Date.now,
  ) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(nodeId)) {
      throw new Error('HLC nodeId must be 1-32 URL-safe characters');
    }
  }

  /** Current state without advancing. */
  peek(): HlcTimestamp {
    return { wallMs: this.wallMs, counter: this.counter, nodeId: this.nodeId };
  }

  /** Generate a timestamp for a local event ("send" or "local" in the paper). */
  tick(): string {
    const physical = this.now();
    if (physical > this.wallMs) {
      this.wallMs = physical;
      this.counter = 0;
    } else {
      this.counter += 1;
      if (this.counter > COUNTER_MAX) {
        // Extremely unlikely; move the logical wall clock forward instead of overflowing.
        this.wallMs += 1;
        this.counter = 0;
      }
    }
    return encodeHlc(this.peek());
  }

  /**
   * Merge a timestamp received from another node ("receive" in the paper), then return a
   * fresh timestamp that is strictly greater than both the local state and the remote one.
   */
  receive(remoteEncoded: string): string {
    const remote = decodeHlc(remoteEncoded);
    const physical = this.now();
    if (remote.wallMs - physical > HLC_MAX_DRIFT_MS) {
      throw new HlcDriftError(remote.wallMs - physical);
    }
    const maxWall = Math.max(physical, this.wallMs, remote.wallMs);
    if (maxWall === this.wallMs && maxWall === remote.wallMs) {
      this.counter = Math.max(this.counter, remote.counter) + 1;
    } else if (maxWall === this.wallMs) {
      this.counter += 1;
    } else if (maxWall === remote.wallMs) {
      this.counter = remote.counter + 1;
    } else {
      this.counter = 0;
    }
    this.wallMs = maxWall;
    return encodeHlc(this.peek());
  }
}
