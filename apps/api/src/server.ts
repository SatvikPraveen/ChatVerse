import { createServer, type Server as HttpServer } from 'node:http';
import type { Express } from 'express';
import { createClock } from './lib/hlc.js';
import { loadEnv, type Env } from './config/env.js';
import type { Deps } from './deps.js';
import { ensureRetentionIndex } from './domain/models/index.js';
import { createApp } from './http/app.js';
import { createLogger } from './infra/logger.js';
import { createMetrics } from './infra/metrics.js';
import { connectMongo, disconnectMongo } from './infra/mongo.js';
import { createRedis } from './infra/redis.js';
import { createGateway, type Gateway } from './realtime/gateway.js';
import { RealtimeHub } from './realtime/hub.js';
import { createServices, type Services } from './services/index.js';

export const VERSION = '2.0.0';

export interface RunningServer {
  deps: Deps;
  services: Services;
  app: Express;
  httpServer: HttpServer;
  gateway: Gateway;
  /** Bound port (useful when PORT=0 in tests). */
  port: number;
  stop(): Promise<void>;
}

/**
 * Assemble and start every component. Used by both `index.ts` (production entry) and the test
 * suite, so the wiring under test is exactly the wiring in production.
 */
export async function startServer(
  overrides: Partial<Env> = {},
  options: { connectDb?: boolean } = {},
): Promise<RunningServer> {
  const env: Env = { ...loadEnv(), ...overrides };
  const logger = createLogger(env);
  const metrics = createMetrics(env.NODE_ID, env.NODE_ENV !== 'test');
  const redis = await createRedis(env, logger);
  if (options.connectDb !== false) await connectMongo(env, logger);
  await ensureRetentionIndex(env.MESSAGE_RETENTION_DAYS);

  const deps: Deps = {
    env,
    logger,
    redis,
    metrics,
    clock: createClock(env.NODE_ID),
    hub: new RealtimeHub(),
    startedAt: new Date(),
    version: VERSION,
  };
  const services = createServices(deps);
  const app = createApp(deps, services);
  const httpServer = createServer(app);
  const gateway = createGateway(httpServer, deps, services);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(env.PORT, env.HOST, () => resolve());
  });
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : env.PORT;
  logger.info(
    { port, host: env.HOST, nodeId: env.NODE_ID, redisShared: redis.shared },
    'server listening',
  );

  let stopping = false;
  return {
    deps,
    services,
    app,
    httpServer,
    gateway,
    port,
    async stop() {
      if (stopping) return;
      stopping = true;
      logger.info('shutting down');
      await gateway.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      if (options.connectDb !== false) await disconnectMongo();
      await redis.close();
      logger.info('shutdown complete');
    },
  };
}
