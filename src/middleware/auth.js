const crypto = require('crypto');
const { query } = require('../db');
const { errors } = require('../lib/errors');
const config = require('../config');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Checks the team API key in the x-api-key header.
async function requireApiKey(req, res, next) {
  try {
    const key = req.get('x-api-key');
    if (!key) throw errors.missingApiKey();
    const { rows } = await query('SELECT id, name FROM teams WHERE api_key_hash = $1 AND NOT revoked', [sha256(key)]);
    if (!rows.length) throw errors.invalidApiKey();
    req.team = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

// Checks the session token in "Authorization: Bearer <token>".
async function requireSession(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw errors.missingToken();
    const { rows } = await query(
      `SELECT s.expires_at, a.id, a.name, a.balance
         FROM sessions s JOIN accounts a ON a.id = s.account_id
        WHERE s.token = $1`,
      [token]
    );
    if (!rows.length) throw errors.sessionExpired();
    if (new Date(rows[0].expires_at) < new Date()) {
      await query('DELETE FROM sessions WHERE token = $1', [token]);
      throw errors.sessionExpired();
    }
    const { id, name, balance } = rows[0];
    req.account = { id, name, balance };
    next();
  } catch (err) {
    next(err);
  }
}

// Admin routes: x-admin-secret header, compared in constant time.
function requireAdmin(req, res, next) {
  const given = Buffer.from(req.get('x-admin-secret') || '');
  const expected = Buffer.from(config.adminSecret);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return next(errors.forbidden());
  }
  next();
}

module.exports = { requireApiKey, requireSession, requireAdmin, sha256 };
