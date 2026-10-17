const rateLimit = require('express-rate-limit');
const config = require('../config');
const { ApiError } = require('../lib/errors');

// 300 requests a minute per API key (a whole team shares one key), or per IP without one,
// so one runaway fetch loop can't slow the API down for every team.
module.exports = rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimitPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.get('x-api-key') || req.ip,
  handler: (req, res, next, options) => {
    const retryAfter = Math.ceil(options.windowMs / 1000);
    next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Wait a minute and try again.', { retryAfter }));
  },
});
