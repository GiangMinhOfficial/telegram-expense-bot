import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleReauth } from '../src/handlers/reauth';
import type { Env } from '../src/env';

/**
 * Điều kiện để /reauth được phép ghi đè người giữ chuỗi: chuỗi mới ĐỔI ĐƯỢC.
 *
 * Chuỗi do device code sinh ra có thể xin ra được mà vẫn không đổi được lần nào
 * (AADSTS70000, đo ngày 2026-09-02). Ghi đè trước rồi mới biết là thay chuỗi
 * đang sống bằng chuỗi chết — nên ở đây đổi thử trước, ghi sau.
 */
const RT_CU = 'RT_DANG_CHAY';
const DEVICE_CODE = 'DEVICE_CODE';
const TOKEN_TABLE = 'ms_token';
const DEVICE_TABLE = 'pending_device_code';
const NOW = Date.now();

interface Call { sql: string; args: unknown[] }

/** `storedChain = null` là kho token trống — trạng thái /reauth sinh ra để dựng lại. */
function fakeDb(pendingDeviceCode: string | null, storedChain: string | null = RT_CU) {
  const calls: Call[] = [];
  const row = (sql: string) => {
    if (sql.includes(DEVICE_TABLE)) {
      return pendingDeviceCode
        ? { device_code: pendingDeviceCode, expires_at: NOW + 600_000, interval_s: 5 }
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

const tokenWrite = (calls: Call[]) =>
  calls.find((c) => c.sql.includes(TOKEN_TABLE) && !c.sql.startsWith('SELECT'));

const clearedDeviceCode = (calls: Call[]) =>
  calls.some((c) => c.sql.startsWith('DELETE') && c.sql.includes(DEVICE_TABLE));

function fakeEnv(db: D1Database): Env {
  return {
    DB: db,
    MS_CLIENT_ID: 'CID',
    MS_CLIENT_SECRET: 'SECRET',
    DRIVE_ITEM_ID: 'X',
    TELEGRAM_BOT_TOKEN: 'BOT',
    TELEGRAM_SECRET: 'X',
    ALLOWED_CHAT_ID: '1',
  };
}

/** Nói thay Microsoft và Telegram: redeem trả gì, đổi thử trả gì, chat nhận gì. */
function stubNetwork(redeem: unknown, probe: unknown) {
  const sent: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('api.telegram.org')) {
      sent.push(JSON.parse(init.body as string).text);
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    }
    const grant = new URLSearchParams(init.body as string).get('grant_type');
    const body = grant === 'refresh_token' ? probe : redeem;
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    });
  }));
  return sent;
}

const REDEEMED = { access_token: 'AT_DEVICE', refresh_token: 'RT_DEVICE', expires_in: 3600 };
const DEAD_CHAIN = {
  error: 'invalid_grant',
  error_description: 'AADSTS70000: Provided grant is invalid or malformed.',
};

afterEach(() => vi.unstubAllGlobals());

describe('/reauth đổi thử chuỗi mới trước khi ghi đè', () => {
  it('chuỗi mới không đổi được thì kho token giữ nguyên', async () => {
    const { db, calls } = fakeDb(DEVICE_CODE);
    stubNetwork(REDEEMED, DEAD_CHAIN);

    await handleReauth(fakeEnv(db), 1);

    expect(tokenWrite(calls)).toBeUndefined();
  });

  it('tin nhắn nêu mã lỗi Microsoft và không tuyên bố thành công', async () => {
    const { db } = fakeDb(DEVICE_CODE);
    const sent = stubNetwork(REDEEMED, DEAD_CHAIN);

    await handleReauth(fakeEnv(db), 1);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('AADSTS70000');
    expect(sent[0]).not.toContain('Bot ghi được rồi');
  });

  it('chuỗi mới đổi được thì ghi đè và báo thành công', async () => {
    const { db, calls } = fakeDb(DEVICE_CODE);
    const sent = stubNetwork(
      REDEEMED,
      { access_token: 'AT_SONG', refresh_token: 'RT_SONG', expires_in: 3600 },
    );

    await handleReauth(fakeEnv(db), 1);

    const write = tokenWrite(calls);
    // Ghi chuỗi SAU khi đổi thử: chính lần đổi thử đã vô hiệu RT_DEVICE.
    expect(write?.args).toContain('RT_SONG');
    expect(write?.args).toContain('AT_SONG');
    expect(sent[0]).toContain('Bot ghi được rồi');
  });

  it('đổi thử hỏng vẫn xoá device code vì mã đã dùng mất', async () => {
    const { db, calls } = fakeDb(DEVICE_CODE);
    stubNetwork(REDEEMED, DEAD_CHAIN);

    await handleReauth(fakeEnv(db), 1);

    expect(clearedDeviceCode(calls)).toBe(true);
  });

  it('người dùng chưa đăng nhập xong thì giữ device code lại', async () => {
    const { db, calls } = fakeDb(DEVICE_CODE);
    stubNetwork({ error: 'authorization_pending' }, DEAD_CHAIN);

    await handleReauth(fakeEnv(db), 1);

    expect(clearedDeviceCode(calls)).toBe(false);
    expect(tokenWrite(calls)).toBeUndefined();
  });

  it('lỗi lạ lúc redeem thì mã còn hạn nên không xoá', async () => {
    const { db, calls } = fakeDb(DEVICE_CODE);
    stubNetwork({ error: 'invalid_client', error_description: 'AADSTS7000218' }, DEAD_CHAIN);

    await handleReauth(fakeEnv(db), 1);

    expect(clearedDeviceCode(calls)).toBe(false);
    expect(tokenWrite(calls)).toBeUndefined();
  });

  it('kho token trống thì nói thẳng là bot chưa ghi được, không hứa suông', async () => {
    const { db, calls } = fakeDb(DEVICE_CODE, null);
    const sent = stubNetwork(REDEEMED, DEAD_CHAIN);

    await handleReauth(fakeEnv(db), 1);

    expect(tokenWrite(calls)).toBeUndefined();
    expect(sent[0]).toContain('bot chưa ghi được');
    expect(sent[0]).not.toContain('ghi bình thường');
  });

  it('đổi được access token mà không có chuỗi kế tiếp thì không cất gì cả', async () => {
    // Cất token vừa đem đi đổi là cất một chuỗi đã chết — đúng cái bẫy của ticket.
    const { db, calls } = fakeDb(DEVICE_CODE);
    const sent = stubNetwork(REDEEMED, { access_token: 'AT_CUT', expires_in: 3600 });

    await handleReauth(fakeEnv(db), 1);

    expect(tokenWrite(calls)).toBeUndefined();
    expect(sent[0]).toContain('refresh token kế tiếp');
  });
});
