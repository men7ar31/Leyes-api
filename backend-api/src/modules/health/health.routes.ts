import { Router } from 'express';
import { DOCUMENT_EXTRACTOR_VERSION } from '../saij/saij.constants';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    service: 'leyes-api',
    extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
  });
});

export default router;
