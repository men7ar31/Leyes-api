import { Router } from 'express';
import { saijProxyPool } from '../saij/saijProxyPool';

const router = Router();

router.get('/saij/proxy-status', (_req, res) => {
  res.json({
    ok: true,
    ...saijProxyPool.getSanitizedStats(),
  });
});

export default router;

