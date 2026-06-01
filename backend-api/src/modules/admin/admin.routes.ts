import { Router } from 'express';
import { saijProxyPool } from '../saij/saijProxyPool';
import { saijHttpClient } from '../saij/saijHttpClient';

const router = Router();

router.get('/saij/proxy-status', (_req, res) => {
  res.json({
    ok: true,
    ...saijProxyPool.getSanitizedStats(),
  });
});

router.get('/saij/proxy-test', async (_req, res) => {
  try {
    const result = await saijHttpClient.proxyTestIpify();
    res.json(result);
  } catch (error: any) {
    res.status(502).json({
      ok: false,
      error: 'saij_proxy_test_failed',
      message: error?.message || 'Proxy test failed',
      details: error?.details || {
        name: error?.name,
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
        cause: error?.cause ? String(error.cause) : null,
        constructorName: error?.constructor?.name || null,
        responseStatus: error?.response?.status ?? null,
        responseHeaders: error?.response?.headers ?? null,
        responseDataPreview:
          typeof error?.response?.data === 'string'
            ? String(error.response.data).slice(0, 500)
            : error?.response?.data
              ? JSON.stringify(error.response.data).slice(0, 500)
              : null,
      },
    });
  }
});

export default router;
