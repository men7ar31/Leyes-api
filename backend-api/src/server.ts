import type { Request, Response } from 'express';
import createApp from './app';
import { env } from './config/env';
import { connectDb } from './config/db';
import { logger } from './utils/logger';

const app = createApp();
let dbReadyPromise: Promise<void> | null = null;

const shouldConnectDb = (req: Request) => {
  const url = req.url || '';
  return url.startsWith('/api/saij');
};

const ensureDbReady = async () => {
  if (!dbReadyPromise) {
    dbReadyPromise = connectDb(env.mongoUri).catch((error) => {
      dbReadyPromise = null;
      throw error;
    });
  }

  await dbReadyPromise;
};

export default async function handler(req: Request, res: Response) {
  try {
    if (shouldConnectDb(req)) {
      await ensureDbReady();
    }

    return app(req, res);
  } catch (error) {
    logger.error({ err: error }, 'Failed to handle request');
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: 'backend_unavailable',
        message: 'El backend no pudo inicializarse correctamente.',
      });
      return;
    }
    throw error;
  }
}
