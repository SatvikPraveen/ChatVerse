import type { HybridLogicalClock } from '@chatverse/protocol';
import type { Env } from './config/env.js';
import type { Logger } from './infra/logger.js';
import type { Metrics } from './infra/metrics.js';
import type { RedisHandle } from './infra/redis.js';
import type { RealtimeHub } from './realtime/hub.js';

/** Everything a service or route needs, assembled once in bootstrap and injected explicitly. */
export interface Deps {
  env: Env;
  logger: Logger;
  redis: RedisHandle;
  metrics: Metrics;
  clock: HybridLogicalClock;
  hub: RealtimeHub;
  startedAt: Date;
  version: string;
}
