import { HybridLogicalClock } from '@chatverse/protocol';

/**
 * One Hybrid Logical Clock per process. Every message stored by this node is stamped from it,
 * and timestamps seen from other nodes (e.g. via the Redis adapter) can be merged with
 * `receive()` so that the clocks of a cluster stay causally consistent.
 */
export function createClock(nodeId: string): HybridLogicalClock {
  return new HybridLogicalClock(nodeId);
}
