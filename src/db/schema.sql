-- KolaPay schema. Safe to run many times: everything is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS teams (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  api_key_hash  TEXT NOT NULL UNIQUE,
  revoked       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,               -- KP-0042
  name          TEXT NOT NULL,
  pin_hash      TEXT NOT NULL,
  balance       INTEGER NOT NULL CHECK (balance >= 0),  -- whole FCFA, never negative
  failed_pins   INTEGER NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  is_intern     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id                  SERIAL PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  favourite           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, contact_account_id)
);

CREATE SEQUENCE IF NOT EXISTS tx_seq;

CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,               -- TX-1019-0042
  from_account  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  fee           INTEGER NOT NULL CHECK (fee >= 0),
  note          TEXT NOT NULL DEFAULT '',
  team_id       INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_from_idx ON transactions (from_account, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_to_idx   ON transactions (to_account, created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_account_idx  ON sessions (account_id);
