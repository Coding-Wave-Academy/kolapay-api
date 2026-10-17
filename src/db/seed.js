const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { calculateFee } = require('../lib/fees');
const { nextTransactionId } = require('./index');

const DEMO_PIN = '1234';
const INTERN_START_BALANCE = 25000;

// The people shown in the KolaPay designs. Demo PIN for all of them: 1234.
const PEOPLE = [
  { id: 'KP-0088', name: 'Brenda Fon', balance: 100000 },
  { id: 'KP-0107', name: 'Ayuk Eta', balance: 100000 },
  { id: 'KP-0031', name: 'Mbah Divine', balance: 100000 },
  { id: 'KP-0190', name: 'Tabe Ndip', balance: 100000 },
  { id: 'KP-0154', name: 'Mami Clara', balance: 100000 },
  { id: 'KP-0213', name: 'Bih Grace', balance: 100000 },
];
const DEMO = { id: 'KP-0042', name: 'Nkeng Ashu', balance: 25000 };

// The demo account's history, exactly as drawn in the designs (hours ago from setup time).
const DEMO_HISTORY = [
  { other: 'KP-0213', direction: 'in', amount: 10000, hoursAgo: 54, note: '' },
  { other: 'KP-0154', direction: 'out', amount: 1500, hoursAgo: 48, note: 'Eru at Buea market' },
  { other: 'KP-0190', direction: 'in', amount: 800, hoursAgo: 30, note: '' },
  { other: 'KP-0031', direction: 'out', amount: 12000, hoursAgo: 25, note: 'Rent share' },
  { other: 'KP-0107', direction: 'in', amount: 2500, hoursAgo: 3, note: '' },
  { other: 'KP-0088', direction: 'out', amount: 5000, hoursAgo: 1, note: 'Lunch' },
];
const DEMO_FAVOURITES = ['KP-0088', 'KP-0107', 'KP-0031', 'KP-0190'];

// Each intern's starting PIN is derived from ADMIN_SECRET, so it is never stored in the repo
// and you can always list it again with GET /v1/admin/accounts.
function internPin(accountId) {
  const n = crypto.createHmac('sha256', config.adminSecret).update(accountId).digest().readUInt32BE(0);
  return String(n % 10000).padStart(4, '0');
}

function internAccounts() {
  return Array.from({ length: config.internCount }, (_, i) => {
    const num = String(1001 + i);
    return { id: `KP-${num}`, name: `Intern ${String(i + 1).padStart(2, '0')}` };
  });
}

async function seed(client) {
  const demoHash = await bcrypt.hash(DEMO_PIN, 10);

  for (const p of [...PEOPLE, DEMO]) {
    await client.query(
      'INSERT INTO accounts (id, name, pin_hash, balance) VALUES ($1, $2, $3, $4)',
      [p.id, p.name, demoHash, p.balance]
    );
  }

  for (const intern of internAccounts()) {
    const hash = await bcrypt.hash(internPin(intern.id), 10);
    await client.query(
      'INSERT INTO accounts (id, name, pin_hash, balance, is_intern) VALUES ($1, $2, $3, $4, TRUE)',
      [intern.id, intern.name, hash, INTERN_START_BALANCE]
    );
    // Every intern starts with the six design people as contacts, so no screen is empty.
    for (const p of PEOPLE) {
      await client.query(
        'INSERT INTO contacts (owner_id, contact_account_id, name) VALUES ($1, $2, $3)',
        [intern.id, p.id, p.name]
      );
    }
  }

  for (const p of PEOPLE) {
    await client.query(
      'INSERT INTO contacts (owner_id, contact_account_id, name, favourite) VALUES ($1, $2, $3, $4)',
      [DEMO.id, p.id, p.name, DEMO_FAVOURITES.includes(p.id)]
    );
  }

  for (const h of DEMO_HISTORY) {
    const createdAt = new Date(Date.now() - h.hoursAgo * 3600 * 1000).toISOString();
    const id = await nextTransactionId(client, createdAt);
    const [from, to] = h.direction === 'out' ? [DEMO.id, h.other] : [h.other, DEMO.id];
    await client.query(
      `INSERT INTO transactions (id, from_account, to_account, amount, fee, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, from, to, h.amount, calculateFee(h.amount), h.note, createdAt]
    );
  }
}

// Wipes accounts, contacts, sessions and transactions. Teams and their keys are kept.
async function reset(client) {
  await client.query('TRUNCATE transactions, contacts, sessions, accounts RESTART IDENTITY CASCADE');
  await client.query("SELECT setval('tx_seq', 1, false)");
  await seed(client);
}

module.exports = { seed, reset, internPin, DEMO_PIN, INTERN_START_BALANCE };
