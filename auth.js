import jwt from 'jsonwebtoken';
import User from '../models/User.js';
export function authRequired(secret) {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.reusecircle_token;
      if (!token) return res.status(401).json({ success: false, message: 'Please log in to continue' });
      const payload = jwt.verify(token, secret);
      const user = await User.findById(payload.sub).select('name email phone role');
      if (!user) return res.status(401).json({ success: false, message: 'Your session is no longer valid' });
      req.user = user; next();
    } catch { return res.status(401).json({ success: false, message: 'Your session is invalid or expired' }); }
  };
}
export function authOptional(secret) {
  return async (req, res, next) => {
    const token = req.cookies?.reusecircle_token;
    if (!token) return next();
    try {
      const payload = jwt.verify(token, secret);
      req.user = await User.findById(payload.sub).select('name email phone role');
    } catch { /* Public listing details remain available to signed-out visitors. */ }
    next();
  };
}
export function moderatorOnly(req, res, next) {
  if (req.user?.role !== 'moderator') return res.status(403).json({ success: false, message: 'Moderator access required' });
  next();
}
