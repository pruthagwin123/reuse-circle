import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { rateLimit } from 'express-rate-limit';
import { createApi } from './routes/api.js';
import { errorHandler, notFound } from './middleware/errors.js';

export function createApp(config) {
  const app = express();
  const uploadsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'uploads');
  fs.mkdirSync(uploadsPath, { recursive: true });
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
  const configuredOrigins = config.clientUrl.split(',').map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({
    origin(origin, callback) {
      const localDevelopmentOrigin = config.nodeEnv !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
      callback(null, !origin || configuredOrigins.includes(origin) || localDevelopmentOrigin);
    },
    credentials: true
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/uploads', express.static(uploadsPath, {
    maxAge: '1d',
    setHeaders(res) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  }));
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.nodeEnv === 'production' ? 30 : 100, standardHeaders: 'draft-7', legacyHeaders: false, skip: (req) => req.path === '/me' || req.path === '/logout', message: { success: false, message: 'Too many sign-in attempts. Please wait a few minutes before trying again.' } });
  app.use('/api/auth', authLimiter);
  app.use('/api', createApi(config));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
