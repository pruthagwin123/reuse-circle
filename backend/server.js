import 'dotenv/config';
import mongoose from 'mongoose';
import { loadConfig } from './config/env.js';
import { createApp } from './app.js';

let config;
try { config = loadConfig(); } catch (error) { console.error(`Configuration error: ${error.message}`); process.exit(1); }
try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const app = createApp(config);
  const server = app.listen(config.port, () => console.log(`ReUseCircle API listening on port ${config.port}`));
  const shutdown = async () => { server.close(); await mongoose.disconnect(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`MongoDB connection failed: ${error.message}`);
  process.exit(1);
}
