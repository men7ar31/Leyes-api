import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import healthRouter from './modules/health/health.routes';
import saijRouter from './modules/saij/saij.routes';
import provincialCodesRouter from './modules/provincial-codes/provincialCodes.routes';
import { notFoundMiddleware } from './middlewares/notFound.middleware';
import { errorMiddleware } from './middlewares/error.middleware';
import { env } from './config/env';

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true }));

  app.get('/', (_req, res) => {
    res.json({
      ok: true,
      service: 'leyes-api',
      status: 'running',
      legalSource: env.legalSource,
      routes: ['/api/health', '/api/saij/search', '/api/saij/document/:guid', '/api/provincial-codes/document'],
    });
  });

  app.use('/api/health', healthRouter);
  app.use('/api/saij', saijRouter);
  app.use('/api/provincial-codes', provincialCodesRouter);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};

export default createApp;
