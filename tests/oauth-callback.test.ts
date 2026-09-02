import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleOAuthCallback } from '../src/handlers/oauthCallback';
import type { Env } from '../src/env';

const PENDING_TABLE = 'pending_auth';
const TOKEN_TABLE = 'ms_token';
const CALLBACK_URL = 'https://worker.example.workers.dev/oauth/callback';

interface Call { sql: string; args: unknown[] }
interface Pending { codeVerifier: string; state: string; expiresAt: number }

function fakeDb(pending: Pending | null, storedChain: string | null = null) {
  const calls: Call[] = [];
  const row = (sql: string) => {
    if (sql.includes(PENDING_TABLE)) {
      return pending
        ? { code_verifier: pending.codeVerifier, state: pending.state, expires_at: pending.expiresAt }
        : null;
    }
    if (sql.includes(TOKEN_TABLE) && storedChain) {
      return { refresh_token: storedChain, access_token: null, expires_at: 0 };
    }
    return null;
  };
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ sql, args });
        return { run: async () => ({ meta: { changes: 1 } }), first: async () => row(sql) };
      },
      run: async () => {
        calls.push({ sql, args: [] });
        return { meta: { changes: 1 } };
      },
      first: async () => row(sql),
    }),
  };
  return { db: db as unknown as D1Database, calls };
}

const clearedPending = (calls: Call[]) =>
  calls.some((c) => c.sql.startsWith('DELETE') && c.sql.includes(PENDING_TABLE));

const tokenWrite = (calls: Call[]) =>
  calls.find((c) => c.sql.includes(TOKEN_TABLE) && !c.sql.startsWith('SELECT'));

function fakeEnv(db: D1Database): Env {
  return {
    DB: db,
    MS_CLIENT_ID: 'CID',
    DRIVE_ITEM_ID: 'X',
    TELEGRAM_BOT_TOKEN: 'BOT',
    TELEGRAM_SECRET: 'X',
    ALLOWED_CHAT_ID: '1',
  };
}

/** authCode = phản hồi cho grant_type=authorization_code, probe = cho grant_type=refresh_token. */
function stubNetwork(authCode?: unknown, probe?: unknown) {
  const sent: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('api.telegram.org')) {
      sent.push(JSON.parse(init.body as string).text);
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    }
    const grant = new URLSearchParams(init.body as string).get('grant_type');
    const body = grant === 'refresh_token' ? probe : authCode;
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }));
  return sent;
}

afterEach(() => vi.unstubAllGlobals());

const PENDING = { codeVerifier: 'VERIFIER123', state: 'STATE123', expiresAt: Date.now() + 600_000 };

describe('handleOAuthCallback — hàng rào state', () => {
  it('thiếu state → 400, không đụng gì tới Telegram hay kho token', async () => {
    const { db, calls } = fakeDb(PENDING);
    const sent = stubNetwork();

    const res = await handleOAuthCallback(fakeEnv(db), new URL(`${CALLBACK_URL}?code=abc`));

    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
    expect(clearedPending(calls)).toBe(false);
  });

  it('không có pending_auth (chưa từng /reauth) → 400, im lặng', async () => {
    const { db } = fakeDb(null);
    const sent = stubNetwork();

    const res = await handleOAuthCallback(
      fakeEnv(db), new URL(`${CALLBACK_URL}?code=abc&state=BAT_KY`),
    );

    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('state không khớp pending → 400, im lặng — không tin dữ liệu chưa xác thực', async () => {
    const { db, calls } = fakeDb(PENDING);
    const sent = stubNetwork();

    const res = await handleOAuthCallback(
      fakeEnv(db), new URL(`${CALLBACK_URL}?code=abc&state=SAI`),
    );

    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
    expect(clearedPending(calls)).toBe(false);
  });
});

describe('handleOAuthCallback — state khớp, dùng một lần', () => {
  it('xoá pending_auth ngay sau khi state khớp, kể cả khi bước sau hỏng', async () => {
    const { db, calls } = fakeDb(PENDING);
    stubNetwork({ error: 'invalid_grant', error_description: 'AADSTS_GIA' });

    await handleOAuthCallback(fakeEnv(db), new URL(`${CALLBACK_URL}?code=abc&state=STATE123`));

    expect(clearedPending(calls)).toBe(true);
  });

  it('pending đã hết hạn → báo qua Telegram, không đổi code', async () => {
    const expired = { ...PENDING, expiresAt: Date.now() - 1000 };
    const { db } = fakeDb(expired);
    const sent = stubNetwork();

    const res = await handleOAuthCallback(
      fakeEnv(db), new URL(`${CALLBACK_URL}?code=abc&state=STATE123`),
    );

    expect(res.status).toBe(400);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('hết hạn');
  });

  it('Microsoft trả ?error= (từ chối đăng nhập) → báo nguyên văn qua Telegram', async () => {
    const { db } = fakeDb(PENDING);
    const sent = stubNetwork();

    const res = await handleOAuthCallback(
      fakeEnv(db),
      new URL(`${CALLBACK_URL}?state=STATE123&error=access_denied&error_description=AADSTS_TU_CHOI`),
    );

    expect(res.status).toBe(400);
    expect(sent[0]).toContain('AADSTS_TU_CHOI');
  });

  it('thiếu code dù state khớp → báo qua Telegram', async () => {
    const { db } = fakeDb(PENDING);
    const sent = stubNetwork();

    const res = await handleOAuthCallback(fakeEnv(db), new URL(`${CALLBACK_URL}?state=STATE123`));

    expect(res.status).toBe(400);
    expect(sent[0]).toContain('Thiếu code');
  });

  it('đổi code lấy token thất bại → báo nguyên văn lỗi Microsoft, không ghi kho', async () => {
    const { db, calls } = fakeDb(PENDING);
    const sent = stubNetwork({
      error: 'invalid_grant', error_description: 'AADSTS70008: mã hết hạn',
    });

    const res = await handleOAuthCallback(
      fakeEnv(db), new URL(`${CALLBACK_URL}?code=abc&state=STATE123`),
    );

    expect(res.status).toBe(400);
    expect(sent[0]).toContain('AADSTS70008');
    expect(tokenWrite(calls)).toBeUndefined();
  });

  it('code đổi được nhưng không có refresh_token → báo qua Telegram, không ghi kho', async () => {
    const { db, calls } = fakeDb(PENDING);
    const sent = stubNetwork({ access_token: 'AT_CUT', expires_in: 3600 });

    await handleOAuthCallback(fakeEnv(db), new URL(`${CALLBACK_URL}?code=abc&state=STATE123`));

    expect(tokenWrite(calls)).toBeUndefined();
    expect(sent[0]).toContain('refresh token');
  });

  it('code đổi được, chuỗi mới đổi thử thành công → ghi kho và báo thành công', async () => {
    const { db, calls } = fakeDb(PENDING);
    const sent = stubNetwork(
      { access_token: 'AT_1', refresh_token: 'RT_1', expires_in: 3600 },
      { access_token: 'AT_2', refresh_token: 'RT_2', expires_in: 3600 },
    );

    const res = await handleOAuthCallback(
      fakeEnv(db), new URL(`${CALLBACK_URL}?code=abc&state=STATE123`),
    );

    expect(res.status).toBe(200);
    const write = tokenWrite(calls);
    // adoptChainIfUsable đổi thử lại (probe) trước khi ghi — chuỗi cất đi là RT_2, không phải RT_1.
    expect(write?.args).toContain('RT_2');
    expect(sent[0]).toContain('Bot ghi được rồi');
  });

  it('code đổi được nhưng chuỗi mới không đổi thử được → không ghi kho', async () => {
    const { db, calls } = fakeDb(PENDING);
    const sent = stubNetwork(
      { access_token: 'AT_1', refresh_token: 'RT_1', expires_in: 3600 },
      { error: 'invalid_grant', error_description: 'AADSTS70000' },
    );

    await handleOAuthCallback(fakeEnv(db), new URL(`${CALLBACK_URL}?code=abc&state=STATE123`));

    expect(tokenWrite(calls)).toBeUndefined();
    expect(sent[0]).toContain('AADSTS70000');
  });
});
