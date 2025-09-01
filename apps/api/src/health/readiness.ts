// apps/api/src/health/readiness.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { redis } from '../db/redis.js';

export const readinessCheck = async (req: Request, res: Response) => {
  const checks = {
    mongodb: false,
    redis: false,
  };

  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState === 1) {
      checks.mongodb = true;
    }

    // Check Redis connection
    await redis.ping();
    checks.redis = true;
  } catch (error) {
    // Redis check failed
  }

  const isReady = Object.values(checks).every(check => check);

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
    checks,
    service: 'chatverse-api'
  });
};
