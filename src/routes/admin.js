const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../db');
const { errors } = require('../lib/errors');
const validate = require('../lib/validate');
const { sha256 } = require('../middleware/auth');
const { reset, internPin, DEMO_PIN } = require('../db/seed');

// Everything here needs the x-admin-secret header (checked in server.js).
const router = express.Router();

// POST /v1/admin/teams  { name: "Team 1" }  -> the key is shown ONCE
router.post('/teams', async (req, res) => {
  const name = validate.text(req.body.name, 'name', { max: 40, required: true });
  const apiKey = `kp_team_${crypto.randomBytes(16).toString('hex')}`;
  const { rows } = await query(
    'INSERT INTO teams (name, api_key_hash) VALUES ($1, $2) RETURNING id, name, created_at',
    [name, sha256(apiKey)]
  );
  res.status(201).json({ ...rows[0], apiKey, warning: 'Save this key now. It is not shown again.' });
});

// GET /v1/admin/teams
router.get('/teams', async (req, res) => {
  const { rows } = await query('SELECT id, name, revoked, created_at FROM teams ORDER BY id');
  res.json({ data: rows });
});

// POST /v1/admin/teams/:id/revoke
router.post('/teams/:id/revoke', async (req, res) => {
  const { rows } = await query(
    'UPDATE teams SET revoked = TRUE WHERE id = $1 RETURNING id, name, revoked',
    [Number(req.params.id) || 0]
  );
  if (!rows.length) throw errors.notFound('That team');
  res.json(rows[0]);
});

// GET /v1/admin/accounts  -> every account, with the starting PIN for intern accounts
router.get('/accounts', async (req, res) => {
  const { rows } = await query('SELECT id, name, balance, is_intern, locked_until FROM accounts ORDER BY id');
  res.json({
    data: rows.map((a) => ({
      id: a.id,
      name: a.name,
      balance: a.balance,
      intern: a.is_intern,
      startingPin: a.is_intern ? internPin(a.id) : DEMO_PIN,
      locked: Boolean(a.locked_until && new Date(a.locked_until) > new Date()),
    })),
  });
});

// PATCH /v1/admin/accounts/:id  { name?, pin?, balance?, unlock? }
router.patch('/accounts/:id', async (req, res) => {
  const id = validate.accountId(req.params.id, 'id');
  const sets = [];
  const params = [id];
  if (req.body.name !== undefined) {
    params.push(validate.text(req.body.name, 'name', { max: 60, required: true }));
    sets.push(`name = $${params.length}`);
  }
  if (req.body.pin !== undefined) {
    params.push(await bcrypt.hash(validate.pin(req.body.pin), 10));
    sets.push(`pin_hash = $${params.length}`);
  }
  if (req.body.balance !== undefined) {
    if (!Number.isInteger(req.body.balance) || req.body.balance < 0) {
      throw errors.validation('balance', 'balance must be a whole number, 0 or more.');
    }
    params.push(req.body.balance);
    sets.push(`balance = $${params.length}`);
  }
  if (req.body.unlock === true) sets.push('failed_pins = 0', 'locked_until = NULL');
  if (!sets.length) throw errors.validation('name', 'Send name, pin, balance or unlock: true.');

  const { rows } = await query(
    `UPDATE accounts SET ${sets.join(', ')} WHERE id = $1 RETURNING id, name, balance`,
    params
  );
  if (!rows.length) throw errors.accountNotFound(id);
  res.json(rows[0]);
});

// POST /v1/admin/reset  -> restores the seed data. Team keys are kept.
router.post('/reset', async (req, res) => {
  await withTransaction(reset);
  res.json({ ok: true, message: 'Accounts, contacts, sessions and transactions restored to the seed.' });
});

// GET /v1/admin/stats  -> transfers per team, for Demo Day
router.get('/stats', async (req, res) => {
  const { rows } = await query(
    `SELECT tm.id, tm.name, COUNT(t.id)::int AS transfers, COALESCE(SUM(t.amount), 0)::int AS volume
       FROM teams tm LEFT JOIN transactions t ON t.team_id = tm.id
      GROUP BY tm.id ORDER BY tm.id`
  );
  res.json({ data: rows });
});

module.exports = router;
