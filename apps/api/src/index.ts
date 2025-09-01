// apps/api/src/index.ts
import 'dotenv/config';
import { createServer } from 'http';
import { connectToDatabase } from './db/mongo.js';
import { connectToRedis } from './db/redis.js';
import { createApp } from './server.js';
import { createSocketServer } from './realtime/io.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

async function bootstrap() {
  try {
    // Connect to databases
    await Promise.all([
      connectToDatabase(),
      connectToRedis()
    ]);

    // Create Express app and HTTP server
    const app = createApp();
    const httpServer = createServer(app);

    // Setup Socket.IO
    createSocketServer(httpServer);

    // Start server
    httpServer.listen(env.PORT, () => {
      logger.info({
        port: env.PORT,
        env: env.NODE_ENV,
        pid: process.pid
      }, 'Server started successfully');
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      httpServer.close(async () => {
        try {
          // Close database connections
          const mongoose = await import('mongoose');
          await mongoose.disconnect();

          const { redis } = await import('./db/redis.js');
          await redis.quit();

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error(error, 'Error during graceful shutdown');
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.fatal(error, 'Failed to start server');
    process.exit(1);
  }
}

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  logger.fatal(error, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled promise rejection');
  process.exit(1);
});

bootstrap();
