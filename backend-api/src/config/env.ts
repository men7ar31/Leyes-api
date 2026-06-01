import dotenv from 'dotenv';

dotenv.config();

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value || value.trim().length === 0) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const required = (value: string | undefined, fallback?: string) => {
  if (value && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error('Missing required environment variable');
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required(process.env.MONGO_URI, 'mongodb://localhost:27017/leyes-app'),
  saijBaseUrl: required(process.env.SAIJ_BASE_URL, 'https://www.saij.gob.ar'),
  legalSource: (process.env.LEGAL_SOURCE ?? 'saij').toLowerCase(),
  infolegBaseUrl: required(process.env.INFOLEG_BASE_URL, 'https://servicios.infoleg.gob.ar/infolegInternet'),
  infolegTimeoutMs: Number(process.env.INFOLEG_REQUEST_TIMEOUT_MS ?? 30000),
  saijProxyEnabled: parseBoolean(process.env.SAIJ_PROXY_ENABLED, false),
  saijProxyList: process.env.SAIJ_PROXY_LIST ?? '',
  saijProxyMaxAttempts: Math.max(1, parseNumber(process.env.SAIJ_PROXY_MAX_ATTEMPTS, 5)),
  saijProxyCooldownMs: Math.max(1000, parseNumber(process.env.SAIJ_PROXY_COOLDOWN_MS, 300000)),
  saijProxyTimeoutMs: Math.max(1000, parseNumber(process.env.SAIJ_PROXY_TIMEOUT_MS, 15000)),
  enableAdminDebugRoutes: parseBoolean(process.env.ENABLE_ADMIN_DEBUG_ROUTES, false),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
