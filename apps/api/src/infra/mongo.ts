import mongoose from 'mongoose';
import type { Env } from '../config/env.js';
import type { Logger } from './logger.js';

export async function connectMongo(
  env: Pick<Env, 'MONGODB_URI'>,
  logger: Logger,
): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose; // already connected (test suite shares one connection)
  mongoose.set('strictQuery', true);
  mongoose.connection.on('error', (err) => logger.error({ err }, 'mongodb error'));
  mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'));
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });
  logger.info('mongodb connected');
  return mongoose;
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

/** Round-trip latency to the primary, used by the readiness probe. */
export async function pingMongo(): Promise<number> {
  const started = performance.now();
  if (!mongoose.connection.db) throw new Error('mongodb not connected');
  await mongoose.connection.db.admin().ping();
  return Math.round((performance.now() - started) * 100) / 100;
}
