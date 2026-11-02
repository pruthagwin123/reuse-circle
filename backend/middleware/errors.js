export function notFound(req, res) { res.status(404).json({ success: false, message: 'Route not found' }); }
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.name === 'MulterError' || err.message === 'Only JPEG, PNG, WebP, or GIF images are allowed') {
    return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller' : err.message });
  }
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ success: false, message: err.name === 'CastError' ? 'Invalid resource ID' : err.message });
  if (err.code === 11000) return res.status(409).json({ success: false, message: 'This action has already been submitted' });
  const status = Number(err.status) || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ success: false, message: status >= 500 ? 'An unexpected server error occurred' : err.message });
}
