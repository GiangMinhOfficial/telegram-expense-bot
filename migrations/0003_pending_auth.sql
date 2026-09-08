-- Thay pending_device_code (ticket 06): /reauth chuyển sang authorization_code
-- + PKCE. Giữ code_verifier + state giữa lúc sinh link /authorize và lúc
-- Microsoft redirect code về /oauth/callback.
DROP TABLE IF EXISTS pending_device_code;

CREATE TABLE IF NOT EXISTS pending_auth (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  code_verifier TEXT    NOT NULL,
  state         TEXT    NOT NULL,
  expires_at    INTEGER NOT NULL
);
