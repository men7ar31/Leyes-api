import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export const connectDb = async (uri: string) => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  logger.info('MongoDB connected');
};
