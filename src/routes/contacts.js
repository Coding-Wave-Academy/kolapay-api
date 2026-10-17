const express = require('express');
const { query } = require('../db');
const { errors } = require('../lib/errors');
const validate = require('../lib/validate');
const { formatContact } = require('../lib/format');

const router = express.Router();

function contactId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw errors.notFound('That contact');
  return id;
}

// GET /v1/contacts?search=
router.get('/', async (req, res) => {
  const search = (req.query.search || '').toString().trim();
  const { rows } = await query(
    `SELECT id, contact_account_id, name, favourite FROM contacts
      WHERE owner_id = $1
        AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR contact_account_id ILIKE '%' || $2 || '%')
      ORDER BY favourite DESC, lower(name)`,
    [req.account.id, search]
  );
  res.json({ data: rows.map(formatContact) });
});

// POST /v1/contacts  { accountId: "KP-0213", name: "Bih Grace" }  (name is optional)
router.post('/', async (req, res) => {
  const accountId = validate.accountId(req.body.accountId);
  let name = validate.text(req.body.name, 'name', { max: 60 });
  if (accountId === req.account.id) {
    throw errors.validation('accountId', "You can't add yourself as a contact.");
  }
  const account = await query('SELECT name FROM accounts WHERE id = $1', [accountId]);
  if (!account.rows.length) throw errors.accountNotFound(accountId);
  if (!name) name = account.rows[0].name;

  const existing = await query(
    'SELECT id FROM contacts WHERE owner_id = $1 AND contact_account_id = $2',
    [req.account.id, accountId]
  );
  if (existing.rows.length) throw errors.contactExists(existing.rows[0].id);

  const { rows } = await query(
    `INSERT INTO contacts (owner_id, contact_account_id, name) VALUES ($1, $2, $3)
     RETURNING id, contact_account_id, name, favourite`,
    [req.account.id, accountId, name]
  );
  res.status(201).json(formatContact(rows[0]));
});

// PATCH /v1/contacts/:id  { favourite: true } and/or { name: "Grace" }
router.patch('/:id', async (req, res) => {
  const id = contactId(req.params.id);
  const { favourite } = req.body;
  if (favourite !== undefined && typeof favourite !== 'boolean') {
    throw errors.validation('favourite', 'favourite must be true or false.');
  }
  const name = req.body.name === undefined ? undefined : validate.text(req.body.name, 'name', { max: 60, required: true });
  if (favourite === undefined && name === undefined) {
    throw errors.validation('favourite', 'Send favourite (true/false) or a new name.');
  }
  const { rows } = await query(
    `UPDATE contacts SET favourite = COALESCE($3, favourite), name = COALESCE($4, name)
      WHERE id = $1 AND owner_id = $2
      RETURNING id, contact_account_id, name, favourite`,
    [id, req.account.id, favourite ?? null, name ?? null]
  );
  if (!rows.length) throw errors.notFound('That contact');
  res.json(formatContact(rows[0]));
});

// DELETE /v1/contacts/:id
router.delete('/:id', async (req, res) => {
  const id = contactId(req.params.id);
  const { rowCount } = await query('DELETE FROM contacts WHERE id = $1 AND owner_id = $2', [id, req.account.id]);
  if (!rowCount) throw errors.notFound('That contact');
  res.status(204).end();
});

module.exports = router;
