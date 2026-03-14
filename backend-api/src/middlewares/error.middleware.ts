import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { HttpError } from '../utils/httpError';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorMiddleware = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      ok: false,
      error: 'validation_error',
      issues: err.flatten(),
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      ok: false,
      error: err.code,
      message: err.message,
      details: err.details,
    });
  }

  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({ ok: false, error: 'internal_error' });
};
