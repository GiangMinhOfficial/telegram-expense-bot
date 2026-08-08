CREATE TABLE IF NOT EXISTS ms_token (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT    NOT NULL,
  access_token  TEXT,
  expires_at    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS last_write (
  chat_id     INTEGER PRIMARY KEY,
  sheet       TEXT    NOT NULL,
  table_name  TEXT    NOT NULL,
  row_index   INTEGER NOT NULL,
  values_json TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_amount (
  id           TEXT    PRIMARY KEY,
  chat_id      INTEGER NOT NULL,
  payload_json TEXT    NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id      INTEGER NOT NULL,
  payload_json TEXT    NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS write_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name  TEXT    NOT NULL,
  row_index   INTEGER,
  description TEXT,
  amount      INTEGER,
  date_serial INTEGER,
  created_at  INTEGER NOT NULL
);
