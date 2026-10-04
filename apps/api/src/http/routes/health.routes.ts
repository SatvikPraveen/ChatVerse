import { Router } from 'express';
import type { HealthResponse } from '@chatverse/protocol';
import type { Deps } from '../../deps.js';
import { pingMongo } from '../../infra/mongo.js';
import { pingRedis } from '../../infra/redis.js';
import { wrap } from '../respond.js';

export function healthRoutes(deps: Deps): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.json({ status: 'ok', nodeId: deps.env.NODE_ID, uptimeSec: Math.round(process.uptime()) });
  });

  router.get(
    '/ready',
    wrap(async (_req, res) => {
      const checks: HealthResponse['checks'] = {};
      const probe = async (name: string, fn: () => Promise<number>) => {
        try {
          checks[name] = { status: 'ok', latencyMs: await fn() };
        } catch (err) {
          checks[name] = { status: 'down', error: (err as Error).message };
        }
      };
      await Promise.all([
        probe('mongodb', pingMongo),
        probe('redis', () => pingRedis(deps.redis.client)),
      ]);
      const down = Object.values(checks).filter((c) => c.status === 'down').length;
      const body: HealthResponse = {
        status: down === 0 ? 'ok' : down === Object.keys(checks).length ? 'down' : 'degraded',
        version: deps.version,
        nodeId: deps.env.NODE_ID,
        uptimeSec: Math.round(process.uptime()),
        checks,
      };
      res.status(body.status === 'down' ? 503 : 200).json(body);
    }),
  );

  return router;
}
