import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeRefreshToken, getAccessToken } from '../src/graph/auth';
import type { Env } from '../src/env';

/**
 * App trên Azure là public client thật từ 2026-09-02: redirect URI chuyển
 * sang platform "Mobile and desktop applications", client secret đã xoá khỏi
 * Azure. Chiều ngược lại với bản trước (ticket 01): gửi client_secret giờ là
 * lỗi (`AADSTS90023`), không gửi mới là đúng. Đo được ngày 2026-09-02.
 */
const stored = { refresh_token: 'RT_CU', access_token: null, expires_at: 0 };

function fakeEnv(): Env {
  const db = {
    prepare: (sql: string) => ({
      bind: () => ({
        run: async () => ({ meta: { changes: 1 } }),
        first: async () => (sql.includes('ms_token') ? stored : null),
      }),
      first: async () => (sql.includes('ms_token') ? stored : null),
      run: async () => ({ meta: { changes: 1 } }),
    }),
  };
  return {
    DB: db as unknown as D1Database,
    MS_CLIENT_ID: 'CID',
    DRIVE_ITEM_ID: 'X',
    TELEGRAM_BOT_TOKEN: 'X',
    TELEGRAM_SECRET: 'X',
    ALLOWED_CHAT_ID: '1',
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('getAccessToken', () => {
  it('không gửi client_secret khi đổi refresh token', async () => {
    let body = new URLSearchParams();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      body = new URLSearchParams(init.body as string);
      return new Response(
        JSON.stringify({ access_token: 'AT_MOI', refresh_token: 'RT_MOI', expires_in: 3600 }),
        { headers: { 'content-type': 'application/json' } },
      );
    }));

    await expect(getAccessToken(fakeEnv())).resolves.toBe('AT_MOI');
    expect(body.has('client_secret')).toBe(false);
    expect(body.get('refresh_token')).toBe('RT_CU');
  });

  it('gửi client_secret cho public client là lỗi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        error: 'invalid_client',
        error_description: 'AADSTS90023: client secret not expected for a public client.',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )));

    const outcome = await exchangeRefreshToken(fakeEnv(), 'RT_CU');
    expect(outcome).toEqual({
      kind: 'failed',
      error: 'AADSTS90023: client secret not expected for a public client.',
    });
  });
});
