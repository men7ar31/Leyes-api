import { Request, Response, NextFunction } from 'express';
import { SearchRequestSchema } from './saij.types';
import { SaijService } from './saij.service';

export const SaijController = {
  async search(req: Request, res: Response, next: NextFunction) {
    try {
      console.log('BODY SEARCH:', req.body);
      const payload = SearchRequestSchema.parse(req.body);
      const result = await SaijService.search(payload);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
