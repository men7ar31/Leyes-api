import { createServer } from 'http';
import mongoose from 'mongoose';
import createApp from './app';
import { env } from './config/env';
import { connectDb } from './config/db';
import { logger } from './utils/logger';

const start = async () => {
  try {
    await connectDb(env.mongoUri);

    const app = createApp();
    const server = createServer(app);

    server.listen(env.port, () => {
      logger.info({ port: env.port }, 'backend-api listening');
    });

    const shutdown = async () => {
      logger.info('Shutting down...');
      server.close();
      await mongoose.connection.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

start();
