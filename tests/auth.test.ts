import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken } from '../src/graph/auth';
import type { Env } from '../src/env';

/**
 * App trên Azure vẫn là confidential client: endpoint token đòi client_secret ở
 * cả grant authorization_code lẫn grant refresh_token. Đo được ngày 2026-09-02 —
 * bỏ secret đi thì Microsoft trả AADSTS70002 chứ không phải bỏ qua.
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
    MS_CLIENT_SECRET: 'SECRET',
    DRIVE_ITEM_ID: 'X',
    TELEGRAM_BOT_TOKEN: 'X',
    TELEGRAM_SECRET: 'X',
    ALLOWED_CHAT_ID: '1',
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('getAccessToken', () => {
  it('gửi client_secret khi đổi refresh token', async () => {
    let body = new URLSearchParams();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      body = new URLSearchParams(init.body as string);
      return new Response(
        JSON.stringify({ access_token: 'AT_MOI', refresh_token: 'RT_MOI', expires_in: 3600 }),
        { headers: { 'content-type': 'application/json' } },
      );
    }));

    await expect(getAccessToken(fakeEnv())).resolves.toBe('AT_MOI');
    expect(body.get('client_secret')).toBe('SECRET');
    expect(body.get('refresh_token')).toBe('RT_CU');
  });
});
