const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  // Render's Internal URL needs no SSL. Set DATABASE_SSL=true when using the External URL.
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

pool.on('error', (err) => console.error('Postgres pool error:', err.message));

const query = (text, params) => pool.query(text, params);

// Runs fn(client) inside BEGIN ... COMMIT. Any thrown error rolls everything back.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Builds a readable transaction ID like TX-1019-0042 from the date and a sequence.
const TX_ID_SQL = `'TX-' || to_char(($1::timestamptz) AT TIME ZONE 'Africa/Douala', 'MMDD') || '-' ||
  lpad(n::text, greatest(4, length(n::text)), '0')`;

async function nextTransactionId(client, createdAt) {
  const { rows } = await client.query(
    `SELECT ${TX_ID_SQL} AS id FROM (SELECT nextval('tx_seq') AS n) s`,
    [createdAt]
  );
  return rows[0].id;
}

module.exports = { pool, query, withTransaction, nextTransactionId };
