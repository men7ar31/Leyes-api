import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export const connectDb = async (uri: string) => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
    return;
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });
  logger.info('MongoDB connected');
};
