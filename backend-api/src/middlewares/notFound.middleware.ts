import { Request, Response, NextFunction } from 'express';

export const notFoundMiddleware = (_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ ok: false, message: 'Endpoint not found' });
};
