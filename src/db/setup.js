const fs = require('fs');
const path = require('path');
const { pool, withTransaction } = require('./index');
const { seed } = require('./seed');

// Creates the tables if missing, then loads the seed data if the database is empty.
// Runs automatically when the server starts, so Render needs no shell or extra command.
async function setup() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM accounts');
  if (rows[0].n === 0) {
    await withTransaction(seed);
    console.log('Database seeded.');
  }
}

module.exports = { setup };

// `npm run db:setup` runs this file directly.
if (require.main === module) {
  setup()
    .then(() => { console.log('Database ready.'); return pool.end(); })
    .catch((err) => { console.error(err); process.exit(1); });
}
