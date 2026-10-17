// Smoke test: runs against a live API (local or Render) and checks every endpoint.
//   BASE_URL=http://localhost:4000 ADMIN_SECRET=... npm test
// WARNING: it ends with POST /admin/reset, which restores the seed data.
require('dotenv').config();

const BASE = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`) + '/v1';
const ADMIN = process.env.ADMIN_SECRET;
let passed = 0;
let failed = 0;

async function call(method, path, { body, key, token, admin, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (admin) headers['x-admin-secret'] = ADMIN;
  const res = await fetch(BASE + path, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

function check(name, condition, info) {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`, info === undefined ? '' : JSON.stringify(info)); }
}
const code = (r) => r.data && r.data.error && r.data.error.code;

(async () => {
  console.log(`Testing ${BASE}\n`);

  let r = await call('GET', '/health');
  check('health is ok', r.status === 200 && r.data.status === 'ok', r);

  r = await call('POST', '/admin/teams', { body: { name: 'Smoke team' } });
  check('admin route refuses without secret', r.status === 403 && code(r) === 'FORBIDDEN', r);
  r = await call('POST', '/admin/teams', { body: { name: 'Smoke team A' }, admin: true });
  check('admin creates a team key', r.status === 201 && r.data.apiKey.startsWith('kp_team_'), r);
  const key = r.data.apiKey;
  r = await call('POST', '/admin/teams', { body: { name: 'Smoke team B' }, admin: true });
  const keyB = r.data.apiKey;
  const teamBId = r.data.id;

  r = await call('POST', '/auth/login', { body: { accountId: 'KP-0042', pin: '1234' } });
  check('no key -> MISSING_API_KEY', code(r) === 'MISSING_API_KEY', r);
  r = await call('POST', '/auth/login', { body: { accountId: 'KP-0042', pin: '1234' }, key: 'kp_team_nope' });
  check('bad key -> INVALID_API_KEY', code(r) === 'INVALID_API_KEY', r);

  r = await call('POST', '/auth/login', { body: { accountId: 'KP-0042', pin: '9999' }, key });
  check('wrong PIN -> INVALID_PIN, 2 left', code(r) === 'INVALID_PIN' && r.data.error.details.attemptsLeft === 2, r);
  r = await call('POST', '/auth/login', { body: { accountId: 'KP-0042', pin: 1234 }, key });
  check('PIN as number -> VALIDATION_ERROR', code(r) === 'VALIDATION_ERROR', r);
  r = await call('POST', '/auth/login', { body: { accountId: 'KP-9999', pin: '1234' }, key });
  check('unknown account -> ACCOUNT_NOT_FOUND', code(r) === 'ACCOUNT_NOT_FOUND', r);
  r = await call('POST', '/auth/login', { body: { accountId: 'kp-0042', pin: '1234' }, key });
  check('login works (lowercase ID accepted)', r.status === 200 && r.data.token && r.data.account.balance === 25000, r);
  const token = r.data.token;

  r = await call('GET', '/me', { key });
  check('no token -> MISSING_TOKEN', code(r) === 'MISSING_TOKEN', r);
  r = await call('GET', '/me', { key, token: 'bogus' });
  check('bad token -> SESSION_EXPIRED', code(r) === 'SESSION_EXPIRED', r);
  r = await call('GET', '/me', { key, token });
  check('/me returns Nkeng, 25000', r.data.name === 'Nkeng Ashu' && r.data.balance === 25000, r);

  r = await call('GET', '/transactions', { key, token });
  const s = r.data.summary;
  check('history has the 6 design transfers', r.data.data.length === 6, r.data.data.length);
  check('summary 18500 / 13300 / 350 fees', s.sent === 18500 && s.received === 13300 && s.fees === 350 && s.count === 6, s);
  check('newest first is Brenda -5000', r.data.data[0].counterparty.name === 'Brenda Fon' && r.data.data[0].type === 'sent', r.data.data[0]);
  check('received rows show fee 0', r.data.data.filter((t) => t.type === 'received').every((t) => t.fee === 0));
  r = await call('GET', '/transactions?type=sent', { key, token });
  check('type=sent gives 3', r.data.data.length === 3 && r.data.data.every((t) => t.type === 'sent'), r.data.data.length);
  r = await call('GET', '/transactions?search=brenda', { key, token });
  check('search by name', r.data.data.length === 1, r.data.data.length);
  r = await call('GET', '/transactions?search=12,000', { key, token });
  check('search by amount with comma', r.data.data.length === 1 && r.data.data[0].amount === 12000, r.data.data);
  r = await call('GET', '/transactions?type=both', { key, token });
  check('bad type -> VALIDATION_ERROR', code(r) === 'VALIDATION_ERROR', r);

  r = await call('GET', '/fees?amount=5000', { key, token });
  check('fee 5000 -> 50, total 5050', r.data.fee === 50 && r.data.total === 5050 && r.data.canAfford, r.data);
  r = await call('GET', '/fees?amount=30000', { key, token });
  check('fee 30000 -> 250, cannot afford', r.data.fee === 250 && r.data.canAfford === false, r.data);
  r = await call('GET', '/fees?amount=60000', { key, token });
  check('fee 60000 -> 500', r.data.fee === 500, r.data);
  r = await call('GET', '/fees', { key, token });
  check('fee without amount -> VALIDATION_ERROR', code(r) === 'VALIDATION_ERROR', r);

  r = await call('GET', '/accounts/KP-0107', { key, token });
  check('lookup KP-0107 -> Ayuk Eta', r.data.name === 'Ayuk Eta', r.data);
  r = await call('GET', '/accounts/KP-7777', { key, token });
  check('lookup unknown -> ACCOUNT_NOT_FOUND', code(r) === 'ACCOUNT_NOT_FOUND', r);

  r = await call('POST', '/transfers', { body: { to: 'KP-0107', amount: 5000, note: 'Eru' }, key, token });
  check('send 5000 -> 201, balance 19950', r.status === 201 && r.data.balance === 19950, r.data);
  check('transaction ID looks like TX-MMDD-0007', /^TX-\d{4}-\d{4,}$/.test(r.data.transaction.id), r.data.transaction);
  check('transaction total 5050', r.data.transaction.total === 5050, r.data.transaction);
  r = await call('POST', '/transfers', { body: { to: 'KP-0107', amount: 30000 }, key, token });
  check('send 30000 -> INSUFFICIENT_FUNDS, needs 10300', code(r) === 'INSUFFICIENT_FUNDS' && r.data.error.details.needed === 10300, r.data);
  check('message is readable', r.data.error.message === 'You need 10,300 FCFA more. Your balance is 19,950 FCFA.', r.data.error.message);
  r = await call('POST', '/transfers', { body: { to: 'KP-0107', amount: '5000' }, key, token });
  check('amount as string -> VALIDATION_ERROR (the + trap)', code(r) === 'VALIDATION_ERROR', r.data);
  r = await call('POST', '/transfers', { body: { to: 'KP-0107', amount: 50 }, key, token });
  check('50 FCFA -> AMOUNT_TOO_SMALL', code(r) === 'AMOUNT_TOO_SMALL', r.data);
  r = await call('POST', '/transfers', { body: { to: 'KP-0107', amount: 600000 }, key, token });
  check('600,000 -> AMOUNT_TOO_LARGE', code(r) === 'AMOUNT_TOO_LARGE', r.data);
  r = await call('POST', '/transfers', { body: { to: 'KP-0042', amount: 1000 }, key, token });
  check('to yourself -> SELF_TRANSFER', code(r) === 'SELF_TRANSFER', r.data);
  r = await call('POST', '/transfers', { body: { to: 'KP-5555', amount: 1000 }, key, token });
  check('to unknown -> ACCOUNT_NOT_FOUND', code(r) === 'ACCOUNT_NOT_FOUND', r.data);
  r = await call('POST', '/transfers', { raw: '{"to": "KP-0107", amount: 5}', key, token });
  check('broken JSON -> VALIDATION_ERROR', code(r) === 'VALIDATION_ERROR', r.data);
  r = await call('GET', '/me', { key, token });
  check('failed transfers changed nothing: 19950', r.data.balance === 19950, r.data);

  r = await call('GET', '/contacts', { key, token });
  check('6 contacts, favourites first', r.data.data.length === 6 && r.data.data[0].favourite, r.data.data);
  r = await call('POST', '/contacts', { body: { accountId: 'KP-1001' }, key, token });
  check('add contact (name from account)', r.status === 201 && r.data.name === 'Intern 01', r.data);
  const cid = r.data.id;
  r = await call('POST', '/contacts', { body: { accountId: 'KP-1001', name: 'Again' }, key, token });
  check('add again -> CONTACT_EXISTS', code(r) === 'CONTACT_EXISTS' && r.data.error.details.contactId === cid, r.data);
  r = await call('PATCH', `/contacts/${cid}`, { body: { favourite: true, name: 'Ngozi' }, key, token });
  check('favourite + rename', r.data.favourite === true && r.data.name === 'Ngozi', r.data);
  r = await call('GET', '/contacts?search=ngo', { key, token });
  check('contact search', r.data.data.length === 1, r.data.data);
  r = await call('DELETE', `/contacts/${cid}`, { key, token });
  check('delete -> 204', r.status === 204, r);
  r = await call('DELETE', `/contacts/${cid}`, { key, token });
  check('delete again -> NOT_FOUND', code(r) === 'NOT_FOUND', r.data);

  r = await call('GET', '/admin/accounts', { admin: true });
  const intern1 = r.data.data.find((a) => a.id === 'KP-1001');
  const intern2 = r.data.data.find((a) => a.id === 'KP-1002');
  check('27 accounts, interns have PINs', r.data.data.length === 27 && /^\d{4}$/.test(intern1.startingPin), r.data.data.length);

  const wrong2 = intern2.startingPin === '0000' ? '1111' : '0000';
  for (let i = 0; i < 2; i++) await call('POST', '/auth/login', { body: { accountId: 'KP-1002', pin: wrong2 }, key });
  r = await call('POST', '/auth/login', { body: { accountId: 'KP-1002', pin: wrong2 }, key });
  check('3rd wrong PIN -> ACCOUNT_LOCKED', code(r) === 'ACCOUNT_LOCKED' && r.status === 423, r.data);
  r = await call('POST', '/auth/login', { body: { accountId: 'KP-1002', pin: intern2.startingPin }, key });
  check('locked even with the right PIN', code(r) === 'ACCOUNT_LOCKED', r.data);
  r = await call('PATCH', '/admin/accounts/KP-1002', { body: { unlock: true, name: 'Brenda Achu' }, admin: true });
  r = await call('POST', '/auth/login', { body: { accountId: 'KP-1002', pin: intern2.startingPin }, key });
  check('admin unlock + rename works', r.status === 200 && r.data.account.name === 'Brenda Achu', r.data);

  // Concurrency: 20 transfers of 2,000 (+50 fee) fired at once from 25,000.
  // Exactly 12 fit (12 x 2,050 = 24,600). The other 8 must fail, and the balance must end at 400.
  r = await call('POST', '/auth/login', { body: { accountId: 'KP-1001', pin: intern1.startingPin }, key: keyB });
  const t1 = r.data.token;
  const results = await Promise.all(Array.from({ length: 20 }, () =>
    call('POST', '/transfers', { body: { to: 'KP-0088', amount: 2000 }, key: keyB, token: t1 })));
  const ok = results.filter((x) => x.status === 201).length;
  const refused = results.filter((x) => code(x) === 'INSUFFICIENT_FUNDS').length;
  r = await call('GET', '/me', { key: keyB, token: t1 });
  check(`20 at once: ${ok} sent, ${refused} refused`, ok === 12 && refused === 8, { ok, refused });
  check('balance after the rush is exactly 400', r.data.balance === 400, r.data);

  r = await call('GET', '/admin/stats', { admin: true });
  const b = r.data.data.find((t) => t.id === teamBId);
  check('stats count team B transfers', b && b.transfers === 12 && b.volume === 24000, b);

  r = await call('POST', '/admin/reset', { admin: true });
  r = await call('POST', '/auth/login', { body: { accountId: 'KP-0042', pin: '1234' }, key });
  check('reset restores the seed (25000)', r.data.account && r.data.account.balance === 25000, r.data);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
