export interface StoredToken { refreshToken: string; accessToken: string | null; expiresAt: number }
export interface LastWrite { sheet: string; tableName: string; rowIndex: number; valuesJson: string }
export interface PendingEntry { id: string; chatId: number; payloadJson: string }

export async function getToken(db: D1Database): Promise<StoredToken | null> {
  const r = await db.prepare(
    'SELECT refresh_token, access_token, expires_at FROM ms_token WHERE id = 1',
  ).first<{ refresh_token: string; access_token: string | null; expires_at: number }>();
  return r
    ? { refreshToken: r.refresh_token, accessToken: r.access_token, expiresAt: r.expires_at }
    : null;
}

export async function saveToken(db: D1Database, t: StoredToken): Promise<void> {
  await db.prepare(
    `INSERT INTO ms_token (id, refresh_token, access_token, expires_at) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET refresh_token = excluded.refresh_token,
       access_token = excluded.access_token, expires_at = excluded.expires_at`,
  ).bind(t.refreshToken, t.accessToken, t.expiresAt).run();
}

/**
 * Ghi token vừa xoay, CHỈ KHI D1 vẫn đang giữ đúng token ta đem đi đổi.
 *
 * Hai lượt chạy song song (cron và webhook) cùng đọc một refresh token rồi cùng
 * đem đi đổi thì Microsoft trả về hai token khác nhau và vô hiệu cái cũ hơn.
 * Ghi đè vô điều kiện là lượt ghi sau có thể đặt một token đã chết vào D1 —
 * từ đó bot hỏng vĩnh viễn. Mệnh đề WHERE dưới đây khiến lượt thua ghi trượt.
 *
 * Trả về false = thua cuộc đua. Không phải lỗi: token của ta đã chết, nhưng
 * access token vừa lấy vẫn dùng được hết giờ nên cứ đi tiếp.
 */
export async function saveRotatedToken(
  db: D1Database, redeemed: string, t: StoredToken,
): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE ms_token SET refresh_token = ?, access_token = ?, expires_at = ?
      WHERE id = 1 AND refresh_token = ?`,
  ).bind(t.refreshToken, t.accessToken, t.expiresAt, redeemed).run();
  return r.meta.changes > 0;
}

/** Vứt access token hỏng. KHÔNG đụng refresh_token — đọc-rồi-ghi cột đó là chỗ hỏng. */
export async function clearAccessToken(db: D1Database): Promise<void> {
  await db.prepare(
    'UPDATE ms_token SET access_token = NULL, expires_at = 0 WHERE id = 1',
  ).run();
}

export async function setLastWrite(db: D1Database, chatId: number, w: LastWrite): Promise<void> {
  await db.prepare(
    `INSERT INTO last_write (chat_id, sheet, table_name, row_index, values_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET sheet = excluded.sheet, table_name = excluded.table_name,
       row_index = excluded.row_index, values_json = excluded.values_json,
       created_at = excluded.created_at`,
  ).bind(chatId, w.sheet, w.tableName, w.rowIndex, w.valuesJson, Date.now()).run();
}

/** Đọc rồi xoá — /undo chỉ dùng được một lần cho mỗi lần ghi. */
export async function takeLastWrite(db: D1Database, chatId: number): Promise<LastWrite | null> {
  const r = await db.prepare(
    'SELECT sheet, table_name, row_index, values_json FROM last_write WHERE chat_id = ?',
  ).bind(chatId).first<{
    sheet: string; table_name: string; row_index: number; values_json: string;
  }>();
  if (!r) return null;
  await db.prepare('DELETE FROM last_write WHERE chat_id = ?').bind(chatId).run();
  return {
    sheet: r.sheet, tableName: r.table_name,
    rowIndex: r.row_index, valuesJson: r.values_json,
  };
}

export async function putPending(db: D1Database, p: PendingEntry): Promise<void> {
  await db.prepare(
    'INSERT INTO pending_amount (id, chat_id, payload_json, created_at) VALUES (?, ?, ?, ?)',
  ).bind(p.id, p.chatId, p.payloadJson, Date.now()).run();
}

export async function takePending(db: D1Database, id: string): Promise<PendingEntry | null> {
  const r = await db.prepare(
    'SELECT id, chat_id, payload_json, created_at FROM pending_amount WHERE id = ?',
  ).bind(id).first<{ id: string; chat_id: number; payload_json: string; created_at: number }>();
  if (!r) return null;
  await db.prepare('DELETE FROM pending_amount WHERE id = ?').bind(id).run();
  // Hết hạn sau 1 giờ (spec mục 4.3).
  if (Date.now() - r.created_at > 3_600_000) return null;
  return { id: r.id, chatId: r.chat_id, payloadJson: r.payload_json };
}

export async function enqueue(db: D1Database, chatId: number, payloadJson: string): Promise<void> {
  await db.prepare(
    'INSERT INTO outbox (chat_id, payload_json, created_at) VALUES (?, ?, ?)',
  ).bind(chatId, payloadJson, Date.now()).run();
}

export async function dueOutbox(db: D1Database, limit: number) {
  const { results } = await db.prepare(
    'SELECT id, chat_id, payload_json, attempts FROM outbox WHERE attempts < 20 ORDER BY id LIMIT ?',
  ).bind(limit).all<{ id: number; chat_id: number; payload_json: string; attempts: number }>();
  return results.map((r) => ({
    id: r.id, chatId: r.chat_id, payloadJson: r.payload_json, attempts: r.attempts,
  }));
}

export async function dropOutbox(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM outbox WHERE id = ?').bind(id).run();
}

export async function bumpOutbox(db: D1Database, id: number, err: string): Promise<void> {
  await db.prepare('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?')
    .bind(err.slice(0, 500), id).run();
}

export async function logWrite(
  db: D1Database,
  r: {
    tableName: string; rowIndex: number; description: string;
    amount: number; dateSerial: number;
  },
): Promise<void> {
  await db.prepare(
    `INSERT INTO write_log (table_name, row_index, description, amount, date_serial, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(r.tableName, r.rowIndex, r.description, r.amount, r.dateSerial, Date.now()).run();
}

export interface PendingAuth { codeVerifier: string; state: string; expiresAt: number }

export async function putPendingAuth(db: D1Database, p: PendingAuth): Promise<void> {
  await db.prepare(
    `INSERT INTO pending_auth (id, code_verifier, state, expires_at) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET code_verifier = excluded.code_verifier,
       state = excluded.state, expires_at = excluded.expires_at`,
  ).bind(p.codeVerifier, p.state, p.expiresAt).run();
}

export async function getPendingAuth(db: D1Database): Promise<PendingAuth | null> {
  const r = await db.prepare(
    'SELECT code_verifier, state, expires_at FROM pending_auth WHERE id = 1',
  ).first<{ code_verifier: string; state: string; expires_at: number }>();
  return r
    ? { codeVerifier: r.code_verifier, state: r.state, expiresAt: r.expires_at }
    : null;
}

export async function clearPendingAuth(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM pending_auth WHERE id = 1').run();
}
