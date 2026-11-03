import mongoose from 'mongoose';
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  phone: { type: String, unique: true, sparse: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  googleId: { type: String, unique: true, sparse: true, select: false },
  role: { type: String, enum: ['user', 'moderator'], default: 'user' }
}, { timestamps: true });
export default mongoose.model('User', userSchema);
