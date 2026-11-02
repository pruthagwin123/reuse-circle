import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reason: { type: String, required: true, trim: true, minlength: 5, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'reviewed', 'dismissed'], default: 'pending', index: true }
}, { timestamps: true });
schema.index({ listingId: 1, reporterId: 1 }, { unique: true });
export default mongoose.model('ContentReport', schema);
