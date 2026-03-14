import crypto from 'crypto';

export const hashString = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');
