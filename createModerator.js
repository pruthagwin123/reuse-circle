import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { loadConfig } from '../config/env.js';

const config = loadConfig();
const { MODERATOR_NAME, MODERATOR_EMAIL, MODERATOR_PASSWORD } = process.env;
if (!MODERATOR_NAME || !MODERATOR_EMAIL || !MODERATOR_PASSWORD) throw new Error('Set MODERATOR_NAME, MODERATOR_EMAIL, and MODERATOR_PASSWORD in backend/.env before running this command');
if (MODERATOR_PASSWORD.length < 5 || !/[A-Z]/.test(MODERATOR_PASSWORD) || !/[a-z]/.test(MODERATOR_PASSWORD) || !/[0-9]/.test(MODERATOR_PASSWORD)) throw new Error('Moderator password must be at least 5 characters and include uppercase, lowercase, and a number');
await mongoose.connect(config.mongoUri);
try {
  const email = MODERATOR_EMAIL.trim().toLowerCase();
  const user = await User.findOneAndUpdate({ email }, { $set: { name: MODERATOR_NAME.trim(), role: 'moderator', passwordHash: await bcrypt.hash(MODERATOR_PASSWORD, 12) } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  console.log(`Moderator account configured: ${user.email}`);
} finally { await mongoose.disconnect(); }
