import pino, { type Logger } from 'pino';
import type { Env } from '../config/env.js';

export type { Logger };

export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL' | 'NODE_ID'>): Logger {
  const pretty = env.NODE_ENV === 'development';
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    base: { nodeId: env.NODE_ID },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.refreshToken'], censor: '[redacted]' },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } } } : {}),
  });
}
