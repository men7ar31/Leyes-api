import dotenv from 'dotenv';

dotenv.config();

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
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
