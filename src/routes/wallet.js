const express = require('express');
const { query, withTransaction, nextTransactionId } = require('../db');
const { errors } = require('../lib/errors');
const validate = require('../lib/validate');
const { calculateFee } = require('../lib/fees');
const { formatTransaction } = require('../lib/format');

const router = express.Router();

// GET /v1/me
router.get('/me', async (req, res) => {
  const { id, name, balance } = req.account;
  res.json({ id, name, balance, currency: 'XAF' });
});

// GET /v1/accounts/:id  -> the name behind an account ID (recipient check, Add contact)
router.get('/accounts/:id', async (req, res) => {
  const id = validate.accountId(req.params.id, 'id');
  const { rows } = await query('SELECT id, name FROM accounts WHERE id = $1', [id]);
  if (!rows.length) throw errors.accountNotFound(id);
  res.json(rows[0]);
});

// GET /v1/fees?amount=5000
router.get('/fees', async (req, res) => {
  const amount = validate.amountFromQuery(req.query.amount);
  const fee = calculateFee(amount);
  const total = amount + fee;
  const { balance } = req.account;
  res.json({ amount, fee, total, canAfford: balance >= total, balance });
});

const TX_SELECT = `
  SELECT t.*, fa.name AS from_name, ta.name AS to_name
    FROM transactions t
    JOIN accounts fa ON fa.id = t.from_account
    JOIN accounts ta ON ta.id = t.to_account`;

// GET /v1/transactions?type=sent|received&search=&limit=20
router.get('/transactions', async (req, res) => {
  const me = req.account.id;
  const type = (req.query.type || '').toString();
  if (!['', 'sent', 'received'].includes(type)) {
    throw errors.validation('type', 'type must be sent, received, or left out.');
  }
  const search = (req.query.search || '').toString().trim().replace(/,/g, '');
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  const { rows } = await query(
    `${TX_SELECT}
     WHERE ( ($2 = 'sent' AND t.from_account = $1)
          OR ($2 = 'received' AND t.to_account = $1)
          OR ($2 = '' AND (t.from_account = $1 OR t.to_account = $1)) )
       AND ( $3 = ''
          OR (CASE WHEN t.from_account = $1 THEN ta.name ELSE fa.name END) ILIKE '%' || $3 || '%'
          OR t.amount::text LIKE $3 || '%'
          OR t.id ILIKE '%' || $3 || '%' )
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT $4`,
    [me, type, search, limit]
  );

  const summary = await query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE from_account = $1), 0)::int AS sent,
            COALESCE(SUM(amount) FILTER (WHERE to_account = $1), 0)::int   AS received,
            COALESCE(SUM(fee) FILTER (WHERE from_account = $1), 0)::int    AS fees,
            COUNT(*)::int AS count
       FROM transactions
      WHERE (from_account = $1 OR to_account = $1)
        AND created_at > now() - interval '7 days'`,
    [me]
  );

  res.json({ data: rows.map((r) => formatTransaction(r, me)), summary: summary.rows[0] });
});

// POST /v1/transfers  { to: "KP-0107", amount: 5000, note: "Eru" }
router.post('/transfers', async (req, res) => {
  const me = req.account.id;
  const to = validate.accountId(req.body.to, 'to');
  const amount = validate.amount(req.body.amount);
  const note = validate.text(req.body.note, 'note', { max: 140 });
  if (to === me) throw errors.selfTransfer();

  const fee = calculateFee(amount);
  const total = amount + fee;

  const result = await withTransaction(async (client) => {
    // Lock both accounts, always in ID order, so two crossing transfers can't deadlock
    // and two transfers from the same account can't both spend the same money.
    const { rows } = await client.query(
      'SELECT id, name, balance FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE',
      [[me, to]]
    );
    const sender = rows.find((r) => r.id === me);
    const recipient = rows.find((r) => r.id === to);
    if (!recipient) throw errors.accountNotFound(to);
    if (sender.balance < total) throw errors.insufficientFunds(total, sender.balance);

    await client.query('UPDATE accounts SET balance = balance - $2 WHERE id = $1', [me, total]);
    await client.query('UPDATE accounts SET balance = balance + $2 WHERE id = $1', [to, amount]);

    const createdAt = new Date().toISOString();
    const id = await nextTransactionId(client, createdAt);
    await client.query(
      `INSERT INTO transactions (id, from_account, to_account, amount, fee, note, team_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, me, to, amount, fee, note, req.team.id, createdAt]
    );

    const row = {
      id, from_account: me, to_account: to, amount, fee, note, created_at: createdAt,
      from_name: sender.name, to_name: recipient.name,
    };
    return { transaction: formatTransaction(row, me), balance: sender.balance - total };
  });

  res.status(201).json(result);
});

module.exports = router;
