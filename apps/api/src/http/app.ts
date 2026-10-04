import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Deps } from '../deps.js';
import type { Services } from '../services/index.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { rateLimit } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { authRoutes } from './routes/auth.routes.js';
import { conversationsRoutes } from './routes/conversations.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { keysRoutes } from './routes/keys.routes.js';
import { messagesRoutes } from './routes/messages.routes.js';
import { pushRoutes } from './routes/push.routes.js';
import { uploadsRoutes } from './routes/uploads.routes.js';
import { usersRoutes } from './routes/users.routes.js';

export function createApp(deps: Deps, services: Services): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.env.TRUST_PROXY ? 1 : false);

  app.use(requestId);
  app.use(
    helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }),
  );
  app.use(
    cors({
      origin: deps.env.CORS_ORIGINS,
      credentials: true,
      exposedHeaders: [
        'X-Request-Id',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Retry-After',
      ],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  if (deps.env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger: deps.logger,
        genReqId: (req) => req.id ?? '',
        autoLogging: {
          ignore: (req) => Boolean(req.url?.startsWith('/health') || req.url === '/metrics'),
        },
      }),
    );
  }

  // Latency histogram per matched route (not per raw URL, to keep cardinality bounded).
  app.use((req, res, next) => {
    const end = deps.metrics.httpRequestDuration.startTimer();
    res.on('finish', () => {
      const route = req.route?.path
        ? `${req.baseUrl}${req.route.path}`
        : req.baseUrl || req.path.split('/').slice(0, 3).join('/');
      end({ method: req.method, route, status: String(res.statusCode) });
    });
    next();
  });

  app.use('/health', healthRoutes(deps));
  if (deps.env.METRICS_ENABLED) {
    app.get('/metrics', async (_req, res) => {
      res.setHeader('Content-Type', deps.metrics.registry.contentType);
      res.send(await deps.metrics.registry.metrics());
    });
  }

  const api = express.Router();
  api.use('/auth', authRoutes(deps, services));
  const authed = requireAuth(services.auth.tokens);
  const limited = rateLimit(deps);
  api.use('/users', authed, limited, usersRoutes(services));
  api.use('/conversations', authed, limited, conversationsRoutes(services));
  api.use('/messages', authed, limited, messagesRoutes(services));
  api.use('/keys', authed, limited, keysRoutes(services));
  api.use('/uploads', authed, limited, uploadsRoutes(services));
  api.use('/push', authed, limited, pushRoutes(services));
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler(deps));
  return app;
}
