import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import healthRouter from './modules/health/health.routes';
import saijRouter from './modules/saij/saij.routes';
import { notFoundMiddleware } from './middlewares/notFound.middleware';
import { errorMiddleware } from './middlewares/error.middleware';

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
      routes: ['/api/health', '/api/saij/search', '/api/saij/document/:guid'],
    });
  });

  app.use('/api/health', healthRouter);
  app.use('/api/saij', saijRouter);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};

export default createApp;
