// apps/api/src/health/liveness.ts
import { Request, Response } from 'express';

export const livenessCheck = (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'chatverse-api'
  });
};
