import 'dotenv/config';
import { startServer } from './server.js';

/** Production entry point: start, then shut down cleanly on signals or fatal errors. */
async function main(): Promise<void> {
  const server = await startServer();
  const { logger } = server.deps;

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'signal received');
    const timer = setTimeout(() => {
      logger.error('forced exit after shutdown timeout');
      process.exit(1);
    }, 15_000);
    timer.unref();
    server
      .stop()
      .then(() => process.exit(0))
      .catch((err) => {
        logger.error({ err }, 'shutdown failed');
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'unhandled promise rejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    shutdown('uncaughtException');
  });
}

main().catch((err) => {
  console.error('fatal: failed to start server\n', err);
  process.exit(1);
});
