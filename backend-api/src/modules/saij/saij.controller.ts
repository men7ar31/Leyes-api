import { Request, Response, NextFunction } from 'express';
import { SearchRequestSchema } from './saij.types';
import { legalSourceRouter } from '../legal-source/legalSourceRouter';
import { logger } from '../../utils/logger';

const inferSearchSource = (result: any): 'infoleg' | 'saij' | 'cache' | 'unknown' => {
  const firstFuente = String(result?.hits?.[0]?.fuente || '').trim().toLowerCase();
  if (firstFuente.includes('infoleg')) return 'infoleg';
  if (firstFuente.includes('saij')) return 'saij';

  const queryFacet = String(result?.query?.f || '').trim().toLowerCase();
  if (queryFacet.includes('infoleg')) return 'infoleg';
  if (queryFacet.includes('saij')) return 'saij';

  return 'unknown';
};

export const SaijController = {
  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = SearchRequestSchema.parse(req.body);
      logger.info(
        {
          endpoint: '/api/saij/search',
          contentType: payload.contentType,
          filters: payload.filters,
          status: 'received',
        },
        'SAIJ search request body'
      );

      const result = await legalSourceRouter.search(payload);
      logger.info(
        {
          endpoint: '/api/saij/search',
          contentType: payload.contentType,
          filters: payload.filters,
          sourceSelected: inferSearchSource(result),
          total: Number(result?.total || 0),
          hits: Array.isArray(result?.hits) ? result.hits.length : 0,
          status: 'responded',
        },
        'SAIJ search source selected'
      );
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
