-- Một mã đang chờ tại một thời điểm: bot chỉ phục vụ một người dùng.
CREATE TABLE IF NOT EXISTS pending_device_code (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  device_code TEXT    NOT NULL,
  expires_at  INTEGER NOT NULL,
  interval_s  INTEGER NOT NULL
);
