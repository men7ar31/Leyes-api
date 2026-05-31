import { Request, Response, NextFunction } from 'express';
import { SearchRequestSchema } from './saij.types';
import { legalSourceRouter } from '../legal-source/legalSourceRouter';

export const SaijController = {
  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = SearchRequestSchema.parse(req.body);
      const result = await legalSourceRouter.search(payload);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async getDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { guid } = req.params;
      const debug = req.query.debug === 'true' || req.query.debug === '1';
      const result = await legalSourceRouter.getDocument(guid, { debug });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async debugFriendly(req: Request, res: Response, next: NextFunction) {
    try {
      const { guid } = req.params;
      const result = await legalSourceRouter.debugDocument(guid);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
