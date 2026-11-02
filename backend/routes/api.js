import { Router } from 'express';
import { body, param, query } from 'express-validator';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import User from '../models/User.js';
import Listing, { CATEGORIES, CONDITIONS } from '../models/Listing.js';
import ItemRequest from '../models/ItemRequest.js';
import ContentReport from '../models/ContentReport.js';
import Wishlist from '../models/Wishlist.js';
import RecentlyViewed from '../models/RecentlyViewed.js';
import Notification from '../models/Notification.js';
import { normalizePhone } from '../utils/phone.js';
import { authRequired, authOptional, moderatorOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const idRule = param('id').isMongoId().withMessage('Invalid ID');
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, data, message = 'Success', status = 200) => res.status(status).json({ success: true, message, data });
const uploadsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads');
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsPath,
    filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)
    ? callback(null, true)
    : callback(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'))
});
const uploadedImageUrl = (req) => req.file ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` : '';
const ownListing = async (req, res, allowModerator = false) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) { res.status(404).json({ success: false, message: 'Listing not found' }); return null; }
  if (!listing.ownerId.equals(req.user._id) && !(allowModerator && req.user.role === 'moderator')) { res.status(403).json({ success: false, message: 'You are not authorized to manage this listing' }); return null; }
  return listing;
};
const cookieOptions = (config) => ({ httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
const userResponse = (user) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone || '', role: user.role });
function safeListing(listing, req, includePrivate = false) {
  const value = listing.toObject ? listing.toObject() : { ...listing };
  if (value.ownerId && typeof value.ownerId === 'object' && value.ownerId.name) {
    value.ownerName = value.ownerId.name;
    value.ownerId = value.ownerId._id;
  } else if (req.user && String(value.ownerId) === String(req.user._id)) value.ownerName = req.user.name;
  if (value.status === 'reserved') value.status = 'sold';
  if (!includePrivate) {
    delete value.pickupAddress;
    delete value.pickupTime;
    delete value.description;
    delete value.contactPhone;
    delete value.ownerName;
  }
  value.image = value.imageUrl || '';
  return value;
}

export function createApi(config) {
  const router = Router();
  const auth = authRequired(config.jwtSecret);
  const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;
  router.get('/health', (req, res) => ok(res, { status: 'ok' }, 'Healthy'));


  router.post('/auth/register', [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters'),
    body('email').trim().isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
    body('password').isLength({ min: 5, max: 128 }).withMessage('Password must be at least 5 characters long')
      .matches(/[a-z]/).withMessage('Password must include a lowercase letter')
      .matches(/[A-Z]/).withMessage('Password must include an uppercase letter')
      .matches(/[0-9]/).withMessage('Password must include a number'),
    body('confirmPassword').custom((v, { req }) => v === req.body.password).withMessage('Passwords do not match'),
    body('phone').custom((value) => Boolean(normalizePhone(value))).withMessage('Please enter a valid international phone number'),
    validate
  ], asyncRoute(async (req, res) => {
    const email = req.body.email.toLowerCase();
    if (await User.exists({ email })) return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    const phone = normalizePhone(req.body.phone);
    if (await User.exists({ phone })) return res.status(409).json({ success: false, message: 'An account with this phone number already exists' });
    let user;
    try {
      user = await User.create({ name: req.body.name, email, phone, passwordHash: await bcrypt.hash(req.body.password, 12) });
    } catch (error) {
      if (error?.code === 11000 && error.keyPattern?.phone) return res.status(409).json({ success: false, message: 'An account with this phone number already exists' });
      throw error;
    }
    const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '7d' });
    res.cookie('reusecircle_token', token, cookieOptions(config));
    ok(res, { user: userResponse(user) }, 'Account created successfully', 201);
  }));
  router.post('/auth/login', [body('email').trim().isEmail().normalizeEmail(), body('password').isString().notEmpty(), validate], asyncRoute(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) return res.status(401).json({ success: false, message: 'Email or password is incorrect' });
    const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '7d' });
    res.cookie('reusecircle_token', token, cookieOptions(config));
    ok(res, { user: userResponse(user) }, 'Welcome back');
  }));
  router.post('/auth/google', [body('credential').isString().notEmpty(), validate], asyncRoute(async (req, res) => {
    if (!googleClient) return res.status(503).json({ success: false, message: 'Google sign-in is not configured' });
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: config.googleClientId });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ success: false, message: 'Google sign-in could not be verified' });
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return res.status(401).json({ success: false, message: 'Google account email could not be verified' });
    }
    const email = payload.email.toLowerCase();
    let user = await User.findOne({ email }).select('+passwordHash +googleId');
    if (!user) {
      user = await User.create({
        name: payload.name || email.split('@')[0],
        email,
        googleId: payload.sub,
        passwordHash: crypto.randomBytes(32).toString('hex')
      });
    } else if (!user.googleId) {
      user.googleId = payload.sub;
      await user.save();
    } else if (user.googleId !== payload.sub) {
      return res.status(401).json({ success: false, message: 'This Google account is not linked to the account email' });
    }
    const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '7d' });
    res.cookie('reusecircle_token', token, cookieOptions(config));
    ok(res, { user: userResponse(user) }, 'Welcome back');
  }));
  router.post('/auth/logout', (req, res) => { res.clearCookie('reusecircle_token', { ...cookieOptions(config), maxAge: undefined }); ok(res, null, 'Logged out successfully'); });
  router.get('/auth/me', auth, (req, res) => ok(res, { user: userResponse(req.user) }));
  router.get('/me/profile', auth, (req, res) => ok(res, { user: userResponse(req.user) }));
  router.patch('/me/profile', auth, [body('name').trim().isLength({ min: 2, max: 100 }), body('phone').custom((value) => Boolean(normalizePhone(value))).withMessage('Please enter a valid international phone number'), validate], asyncRoute(async (req, res) => {
    req.user.name = req.body.name;
    const phone = normalizePhone(req.body.phone);
    if (await User.exists({ phone, _id: { $ne: req.user._id } })) return res.status(409).json({ success: false, message: 'An account with this phone number already exists' });
    req.user.phone = phone;
    try {
      await req.user.save();
    } catch (error) {
      if (error?.code === 11000 && error.keyPattern?.phone) return res.status(409).json({ success: false, message: 'An account with this phone number already exists' });
      throw error;
    }
    ok(res, { user: userResponse(req.user) }, 'Profile updated');
  }));
  router.patch('/me/password', auth, [
    body('email').trim().isEmail().normalizeEmail(),
    body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 5, max: 128 }).withMessage('New password must be at least 5 characters long')
      .matches(/[a-z]/).withMessage('New password must include a lowercase letter')
      .matches(/[A-Z]/).withMessage('New password must include an uppercase letter')
      .matches(/[0-9]/).withMessage('New password must include a number'),
    body('confirmPassword').custom((value, { req }) => value === req.body.newPassword).withMessage('New passwords do not match'),
    validate
  ], asyncRoute(async (req, res) => {
    if (req.body.email.toLowerCase() !== req.user.email) return res.status(401).json({ success: false, message: 'The email does not match your signed-in account' });
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    await user.save();
    ok(res, null, 'Password changed successfully');
  }));

  router.get('/listings', [query('search').optional().trim().isLength({ max: 120 }), query('category').optional().trim().isLength({ min: 2, max: 80 }), query('condition').optional().isIn(CONDITIONS), query('status').optional().isIn(['available', 'reserved', 'sold', 'collected']), query('location').optional().trim().isLength({ max: 120 }), query('sort').optional().isIn(['newest', 'oldest']), query('recent').optional().isBoolean(), query('page').optional().isInt({ min: 1, max: 100000 }), query('limit').optional().isInt({ min: 1, max: 50 }), validate], asyncRoute(async (req, res) => {
    const { search, category, condition, status, location, sort, recent } = req.query;
    const filter = { status: 'available' };
    if (category === 'Other') filter.category = { $nin: CATEGORIES.filter((value) => value !== 'Other') };
    else if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (location) filter.pickupArea = { $regex: location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (status && status !== 'available') filter._id = null;
    if (search) { const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ title: { $regex: escaped, $options: 'i' } }, { description: { $regex: escaped, $options: 'i' } }]; }
    const page = Number(req.query.page || 1); const limit = Number(req.query.limit || 12);
    const sortOrder = sort === 'oldest' ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 };
    if (recent === 'true') filter.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    const [items, total] = await Promise.all([Listing.find(filter).select('-__v').populate('ownerId', 'name').sort(sortOrder).skip((page - 1) * limit).limit(limit).lean(), Listing.countDocuments(filter)]);
    ok(res, { items: items.map(item => safeListing(item, req)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  }));
  router.post('/listings', auth, imageUpload.single('image'), [body('title').trim().isLength({ min: 2, max: 120 }), body('category').trim().isLength({ min: 2, max: 80 }), body('condition').isIn(CONDITIONS), body('description').trim().isLength({ min: 10, max: 2000 }), body('pickupArea').trim().isLength({ min: 2, max: 120 }), body('pickupAddress').trim().isLength({ min: 5, max: 300 }), body('pickupTime').trim().isLength({ min: 3, max: 200 }), body('contactPhone').optional({ values: 'falsy' }).custom((value) => Boolean(normalizePhone(value))).withMessage('Please enter a valid international contact phone number'), body('imageUrl').optional({ values: 'falsy' }).isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('Image URL must be a valid http or https URL'), validate], asyncRoute(async (req, res) => {
    const contactPhone = req.body.contactPhone ? normalizePhone(req.body.contactPhone) : '';
    const listing = await Listing.create({ ownerId: req.user._id, title: req.body.title, category: req.body.category, condition: req.body.condition, description: req.body.description, pickupArea: req.body.pickupArea, pickupAddress: req.body.pickupAddress, pickupTime: req.body.pickupTime, contactPhone, imageUrl: uploadedImageUrl(req) || req.body.imageUrl || '' });
    ok(res, { listing: safeListing(listing, req, true) }, 'Listing created successfully', 201);
  }));
  router.get('/listings/:id', authOptional(config.jwtSecret), [idRule, validate], asyncRoute(async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Log in to view full listing details' });
    const listing = await Listing.findById(req.params.id).select('-__v').populate('ownerId', 'name');
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    const isOwner = req.user && String(listing.ownerId._id || listing.ownerId) === String(req.user._id);
    const hasAcceptedRequest = req.user && await ItemRequest.exists({ listingId: listing._id, requesterId: req.user._id, status: 'accepted' });
    const isModerator = req.user.role === 'moderator';
    if ((listing.status === 'collected' && !isOwner && !isModerator) || (['sold', 'reserved'].includes(listing.status) && !isOwner && !isModerator && !hasAcceptedRequest)) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }
    await RecentlyViewed.findOneAndUpdate({ userId: req.user._id, listingId: listing._id }, { $set: { viewedAt: new Date() } }, { upsert: true, setDefaultsOnInsert: true });
    ok(res, { listing: safeListing(listing, req, Boolean(isOwner || hasAcceptedRequest || isModerator)) });
  }));
  router.patch('/listings/:id', auth, imageUpload.single('image'), [idRule, body('title').optional().trim().isLength({ min: 2, max: 120 }), body('category').optional().trim().isLength({ min: 2, max: 80 }), body('condition').optional().isIn(CONDITIONS), body('description').optional().trim().isLength({ min: 10, max: 2000 }), body('pickupArea').optional().trim().isLength({ min: 2, max: 120 }), body('pickupAddress').optional().trim().isLength({ min: 5, max: 300 }), body('pickupTime').optional().trim().isLength({ min: 3, max: 200 }), body('contactPhone').optional({ values: 'falsy' }).custom((value) => value === '' || Boolean(normalizePhone(value))).withMessage('Please enter a valid international contact phone number'), body('status').optional().isString().withMessage('Invalid listing status'), validate], asyncRoute(async (req, res) => {
    const listing = await ownListing(req, res, true); if (!listing) return;
    if (listing.status !== 'available') return res.status(409).json({ success: false, message: 'Only available listings can be edited' });
    if (req.body.status !== undefined && req.body.status !== listing.status) return res.status(400).json({ success: false, message: 'Listing workflow status cannot be changed here' });
    const fields = ['title', 'category', 'condition', 'description', 'pickupArea', 'pickupAddress', 'pickupTime', 'imageUrl'];
    for (const field of fields) if (req.body[field] !== undefined) listing[field] = req.body[field];
    if (req.body.contactPhone !== undefined) listing.contactPhone = req.body.contactPhone ? normalizePhone(req.body.contactPhone) : '';
    if (req.file) listing.imageUrl = uploadedImageUrl(req);
    else if (req.body.imageUrl !== undefined) listing.imageUrl = req.body.imageUrl;
    else if (req.body.image !== undefined) listing.imageUrl = req.body.image;
    await listing.save(); ok(res, { listing: safeListing(listing, req, true) }, 'Listing updated successfully');
  }));
  router.delete('/listings/:id', auth, [idRule, validate], asyncRoute(async (req, res) => {
    const listing = await ownListing(req, res); if (!listing) return;
    if (listing.status !== 'available') return res.status(409).json({ success: false, message: 'Only available listings can be deleted' });
    await Promise.all([Listing.deleteOne({ _id: listing._id }), ItemRequest.deleteMany({ listingId: listing._id }), ContentReport.deleteMany({ listingId: listing._id })]);
    ok(res, null, 'Listing deleted successfully');
  }));
  router.get('/me/listings', auth, asyncRoute(async (req, res) => {
    const listings = await Listing.find({ ownerId: req.user._id }).sort({ createdAt: -1 }).lean();
    ok(res, { listings: listings.map(item => safeListing(item, req, true)) });
  }));

  router.post('/listings/:id/requests', auth, [idRule, body('message').trim().isLength({ min: 5, max: 1000 }), validate], asyncRoute(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (listing.ownerId.equals(req.user._id)) return res.status(403).json({ success: false, message: 'You cannot request your own listing' });
    if (listing.status !== 'available') return res.status(409).json({ success: false, message: 'This item is no longer available for requests' });
    if (await ItemRequest.exists({ listingId: listing._id, requesterId: req.user._id, status: { $in: ['pending', 'accepted'] } })) return res.status(409).json({ success: false, message: 'You have already requested this item.' });
    let request;
    try { request = await ItemRequest.create({ listingId: listing._id, requesterId: req.user._id, message: req.body.message }); }
    catch (error) {
      if (error?.code === 11000) return res.status(409).json({ success: false, message: 'You have already requested this item.' });
      throw error;
    }
    ok(res, { request }, 'Request sent successfully', 201);
  }));
  router.get('/me/requests', auth, asyncRoute(async (req, res) => {
    const requests = await ItemRequest.find({ requesterId: req.user._id }).populate('listingId').sort({ createdAt: -1 }).lean();
    const visibleRequests = requests
      .filter((item) => item.listingId && item.listingId.status !== 'collected')
      .map(item => ({ ...item, listingId: safeListing(item.listingId, req, item.status === 'accepted') }));
    ok(res, { requests: visibleRequests });
  }));
  router.get('/listings/:id/requests', auth, [idRule, validate], asyncRoute(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (!listing.ownerId.equals(req.user._id)) return res.status(403).json({ success: false, message: 'Only the listing owner can view requests' });
    const requests = await ItemRequest.find({ listingId: listing._id }).populate('requesterId', 'name').populate('listingId', 'title imageUrl pickupArea').sort({ createdAt: -1 }).lean();
    ok(res, { requests });
  }));
  router.patch('/requests/:id/status', auth, [idRule, body('status').isIn(['accepted', 'declined']), body('rejectionReason').if(body('status').equals('declined')).trim().isLength({ min: 5, max: 1000 }).withMessage('Please provide a rejection reason'), validate], asyncRoute(async (req, res) => {
    const request = await ItemRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    const listing = await Listing.findById(request.listingId);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (!listing.ownerId.equals(req.user._id)) return res.status(403).json({ success: false, message: 'Only the listing owner can manage requests' });
    if (request.status !== 'pending') return res.status(409).json({ success: false, message: 'This request has already been resolved' });
    if (req.body.status === 'accepted') {
      const topology = mongoose.connection.client?.topology?.description?.type;
      if (topology && topology !== 'Single') {
        const session = await mongoose.startSession();
        let selected; let reserved;
        try {
          await session.withTransaction(async () => {
            reserved = await Listing.findOneAndUpdate({ _id: listing._id, status: 'available' }, { $set: { status: 'sold' } }, { new: true, session });
            if (!reserved) { const error = new Error('This item is no longer available'); error.status = 409; throw error; }
            selected = await ItemRequest.findOneAndUpdate({ _id: request._id, status: 'pending' }, { $set: { status: 'accepted' } }, { new: true, session });
            if (!selected) { const error = new Error('This request was already resolved'); error.status = 409; throw error; }
            await ItemRequest.updateMany({ listingId: listing._id, _id: { $ne: request._id }, status: 'pending' }, { $set: { status: 'declined' } }, { session });
          });
          return ok(res, { request: selected, listing: reserved }, 'Request accepted; competing requests declined');
        } finally { await session.endSession(); }
      }
      const reserved = await Listing.findOneAndUpdate({ _id: listing._id, status: 'available' }, { $set: { status: 'sold' } }, { new: true });
      if (!reserved) return res.status(409).json({ success: false, message: 'This item is no longer available' });
      const selected = await ItemRequest.findOneAndUpdate({ _id: request._id, status: 'pending' }, { $set: { status: 'accepted' } }, { new: true });
      if (!selected) { await Listing.updateOne({ _id: listing._id, status: 'sold' }, { $set: { status: 'available' } }); return res.status(409).json({ success: false, message: 'This request was already resolved' }); }
      await ItemRequest.updateMany({ listingId: listing._id, _id: { $ne: request._id }, status: 'pending' }, { $set: { status: 'declined' } });
      return ok(res, { request: selected, listing: reserved }, 'Request accepted; competing requests declined');
    }
    const declined = await ItemRequest.findOneAndUpdate({ _id: request._id, status: 'pending' }, { $set: { status: 'declined', rejectionReason: req.body.rejectionReason } }, { new: true });
    if (!declined) return res.status(409).json({ success: false, message: 'This request was already resolved' });
    const seller = await User.findById(req.user._id).select('name').lean();
    await Notification.updateOne(
      { requestId: declined._id, type: 'request_rejected' },
      { $setOnInsert: { userId: declined.requesterId, requestId: declined._id, type: 'request_rejected', message: `Your request for ${listing.title} was rejected by ${seller.name}.`, reason: declined.rejectionReason } },
      { upsert: true }
    );
    ok(res, { request: declined, listing }, 'Request declined');
  }));
  router.patch('/listings/:id/collect', auth, [idRule, validate], asyncRoute(async (req, res) => {
    return res.status(403).json({ success: false, message: 'Only the accepted requester can mark an item as collected' });
  }));
  router.patch('/requests/:id/collect', auth, [idRule, validate], asyncRoute(async (req, res) => {
    const request = await ItemRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (!request.requesterId.equals(req.user._id)) return res.status(403).json({ success: false, message: 'Only the requester can mark this item as collected' });
    if (request.status !== 'accepted') return res.status(409).json({ success: false, message: 'Only accepted requests can be marked as collected' });
    const listing = await Listing.findOneAndUpdate({ _id: request.listingId, status: { $in: ['sold', 'reserved'] } }, { $set: { status: 'collected' } }, { new: true });
    if (!listing) return res.status(409).json({ success: false, message: 'This item is no longer available for collection' });
    request.status = 'collected'; await request.save();
    ok(res, { request, listing }, 'Item marked as collected');
  }));
  router.get('/me/notifications', auth, asyncRoute(async (req, res) => {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    ok(res, { notifications, unread: notifications.filter((notification) => !notification.readAt).length });
  }));
  router.patch('/notifications/:id/read', auth, [idRule, validate], asyncRoute(async (req, res) => {
    const notification = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { readAt: new Date() } }, { new: true });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    ok(res, { notification }, 'Notification marked as read');
  }));
  router.get('/me/wishlist', auth, asyncRoute(async (req, res) => {
    const entries = await Wishlist.find({ userId: req.user._id }).populate({ path: 'listingId', populate: { path: 'ownerId', select: 'name' } }).sort({ createdAt: -1 }).lean();
    const listings = entries.filter(entry => entry.listingId && entry.listingId.status === 'available').map(entry => safeListing(entry.listingId, req));
    ok(res, { listings });
  }));
  router.post('/listings/:id/wishlist', auth, [idRule, validate], asyncRoute(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (listing.status !== 'available') return res.status(409).json({ success: false, message: 'Only available listings can be added to a wishlist' });
    await Wishlist.updateOne({ userId: req.user._id, listingId: listing._id }, { $setOnInsert: { userId: req.user._id, listingId: listing._id } }, { upsert: true });
    ok(res, { wishlisted: true }, 'Added to wishlist');
  }));
  router.delete('/listings/:id/wishlist', auth, [idRule, validate], asyncRoute(async (req, res) => {
    await Wishlist.deleteOne({ userId: req.user._id, listingId: req.params.id });
    ok(res, { wishlisted: false }, 'Removed from wishlist');
  }));
  router.get('/me/recently-viewed', auth, asyncRoute(async (req, res) => {
    const entries = await RecentlyViewed.find({ userId: req.user._id }).populate({ path: 'listingId', populate: { path: 'ownerId', select: 'name' } }).sort({ viewedAt: -1 }).limit(10).lean();
    const listings = entries.filter(entry => entry.listingId && entry.listingId.status === 'available').map(entry => safeListing(entry.listingId, req));
    ok(res, { listings });
  }));
  router.post('/listings/:id/reports', auth, [idRule, body('reason').trim().isLength({ min: 5, max: 1000 }), validate], asyncRoute(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (listing.status === 'collected' && !listing.ownerId.equals(req.user._id) && req.user.role !== 'moderator') return res.status(404).json({ success: false, message: 'Listing not found' });
    if (listing.ownerId.equals(req.user._id)) return res.status(403).json({ success: false, message: 'You cannot report your own listing' });
    if (await ContentReport.exists({ listingId: listing._id, reporterId: req.user._id })) return res.status(409).json({ success: false, message: 'You have already reported this listing' });
    const report = await ContentReport.create({ listingId: listing._id, reporterId: req.user._id, reason: req.body.reason });
    ok(res, { report }, 'Report submitted for review', 201);
  }));
  router.get('/moderation/reports', auth, moderatorOnly, asyncRoute(async (req, res) => {
    const status = req.query.status && ['pending', 'reviewed', 'dismissed'].includes(req.query.status) ? req.query.status : undefined;
    const reports = await ContentReport.find(status ? { status } : {}).populate('listingId').populate('reporterId', 'name').sort({ createdAt: 1 }).lean();
    ok(res, { reports: reports.map(report => ({ ...report, listingId: report.listingId ? safeListing(report.listingId, req) : null })) });
  }));
  router.patch('/moderation/reports/:id/status', auth, moderatorOnly, [idRule, body('status').isIn(['reviewed', 'dismissed']), validate], asyncRoute(async (req, res) => {
    const report = await ContentReport.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status } }, { new: true, runValidators: true });
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    ok(res, { report }, 'Report resolved');
  }));
  router.get('/dashboard/summary', auth, asyncRoute(async (req, res) => {
    const owner = req.user._id;
    const [listingCounts, receivedPending, submitted] = await Promise.all([
      Listing.aggregate([{ $match: { ownerId: owner } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      ItemRequest.countDocuments({ listingId: { $in: await Listing.find({ ownerId: owner }).distinct('_id') }, status: 'pending' }),
      ItemRequest.countDocuments({ requesterId: owner })
    ]);
    const counts = Object.fromEntries(listingCounts.map((x) => [x._id, x.count]));
    ok(res, { totalListings: Object.values(counts).reduce((a, b) => a + b, 0), availableListings: counts.available || 0, soldListings: (counts.sold || 0) + (counts.reserved || 0), collectedItems: counts.collected || 0, pendingRequestsReceived: receivedPending, requestsSubmitted: submitted });
  }));
  return router;
}
