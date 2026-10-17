const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { errors } = require('../lib/errors');
const validate = require('../lib/validate');
const { requireApiKey } = require('../middleware/auth');
const config = require('../config');

const MAX_ATTEMPTS = 3;
const router = express.Router();

// POST /v1/auth/login  { accountId: "KP-0042", pin: "1234" }
router.post('/login', requireApiKey, async (req, res) => {
  const accountId = validate.accountId(req.body.accountId);
  const pin = validate.pin(req.body.pin);

  const { rows } = await query(
    'SELECT id, name, balance, pin_hash, failed_pins, locked_until FROM accounts WHERE id = $1',
    [accountId]
  );
  const account = rows[0];
  if (!account) throw errors.accountNotFound(accountId);

  const now = new Date();
  if (account.locked_until && new Date(account.locked_until) > now) {
    const minutes = Math.ceil((new Date(account.locked_until) - now) / 60000);
    throw errors.accountLocked(new Date(account.locked_until).toISOString(), minutes);
  }

  const correct = await bcrypt.compare(pin, account.pin_hash);
  if (!correct) {
    const failed = account.failed_pins + 1;
    if (failed >= MAX_ATTEMPTS) {
      const unlocksAt = new Date(now.getTime() + config.pinLockMinutes * 60000);
      await query('UPDATE accounts SET failed_pins = 0, locked_until = $2 WHERE id = $1', [accountId, unlocksAt]);
      throw errors.accountLocked(unlocksAt.toISOString(), config.pinLockMinutes);
    }
    await query('UPDATE accounts SET failed_pins = $2 WHERE id = $1', [accountId, failed]);
    throw errors.invalidPin(MAX_ATTEMPTS - failed);
  }

  await query('UPDATE accounts SET failed_pins = 0, locked_until = NULL WHERE id = $1', [accountId]);
  await query('DELETE FROM sessions WHERE account_id = $1 AND expires_at < now()', [accountId]);

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(now.getTime() + config.sessionHours * 3600000);
  await query('INSERT INTO sessions (token, account_id, expires_at) VALUES ($1, $2, $3)', [token, accountId, expiresAt]);

  res.json({
    token,
    expiresAt: expiresAt.toISOString(),
    account: { id: account.id, name: account.name, balance: account.balance },
  });
});

module.exports = router;
