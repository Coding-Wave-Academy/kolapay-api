require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://localhost:5432/kolapay',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  adminSecret: process.env.ADMIN_SECRET || (isProduction ? '' : 'dev-admin-secret'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  pinLockMinutes: Number(process.env.PIN_LOCK_MINUTES) || 5,
  sessionHours: Number(process.env.SESSION_HOURS) || 8,
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE) || 300,
  internCount: Number(process.env.INTERN_COUNT) || 20,
  isProduction,
};

if (!config.adminSecret || config.adminSecret.length < 16) {
  console.error('ADMIN_SECRET must be set to at least 16 characters.');
  process.exit(1);
}

module.exports = config;
