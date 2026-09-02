import { afterEach, describe, expect, it, vi } from 'vitest';
import { adoptChainIfUsable, handleReauth } from '../src/handlers/reauth';
import type { Env } from '../src/env';

const RT_CU = 'RT_DANG_CHAY';
const TOKEN_TABLE = 'ms_token';
const PENDING_TABLE = 'pending_auth';

interface Call { sql: string; args: unknown[] }

/** `storedChain = null` là kho token trống — trạng thái /reauth sinh ra để dựng lại. */
function fakeDb(storedChain: string | null = RT_CU) {
  const calls: Call[] = [];
  const row = (sql: string) => {
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

const pendingAuthWrite = (calls: Call[]) =>
  calls.find((c) => c.sql.includes(PENDING_TABLE) && !c.sql.startsWith('SELECT'));

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

/** Nói thay Telegram, và (khi cho) thay Microsoft cho lượt đổi thử refresh_token. */
function stubNetwork(probe?: unknown) {
  const sent: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('api.telegram.org')) {
      sent.push(JSON.parse(init.body as string).text);
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify(probe), { headers: { 'content-type': 'application/json' } });
  }));
  return sent;
}

afterEach(() => vi.unstubAllGlobals());

const ORIGIN = 'https://worker.example.workers.dev';

describe('handleReauth', () => {
  it('cất code_verifier + state vào pending_auth', async () => {
    const { db, calls } = fakeDb();
    stubNetwork();

    await handleReauth(fakeEnv(db), 1, ORIGIN);

    expect(pendingAuthWrite(calls)).toBeDefined();
  });

  it('gửi link /authorize kèm PKCE, trỏ đúng origin, không lộ client_secret', async () => {
    const { db } = fakeDb();
    const sent = stubNetwork();

    await handleReauth(fakeEnv(db), 1, ORIGIN);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    );
    expect(sent[0]).toContain('redirect_uri=https%3A%2F%2Fworker.example.workers.dev%2Foauth%2Fcallback');
    expect(sent[0]).toContain('code_challenge=');
    expect(sent[0]).toContain('code_challenge_method=S256');
    expect(sent[0]).toContain('state=');
    expect(sent[0]).not.toContain('client_secret');
  });

  it('nói rõ không cần gửi lại /reauth — luồng tự hoàn tất qua redirect', async () => {
    const { db } = fakeDb();
    const sent = stubNetwork();

    await handleReauth(fakeEnv(db), 1, ORIGIN);

    expect(sent[0]).toContain('không cần gửi lại /reauth');
  });
});

/**
 * Điều kiện để `/oauth/callback` được phép ghi đè người giữ chuỗi: chuỗi mới
 * ĐỔI ĐƯỢC. Chuỗi vừa cấp có thể xin ra được mà vẫn không đổi được lần nào
 * (đo được với device code, AADSTS70000, ticket 06). Ghi đè trước rồi mới biết
 * là thay chuỗi đang sống bằng chuỗi chết — nên ở đây đổi thử trước, ghi sau.
 */
describe('adoptChainIfUsable', () => {
  const DEAD_CHAIN = {
    error: 'invalid_grant',
    error_description: 'AADSTS70000: Provided grant is invalid or malformed.',
  };

  it('chuỗi mới không đổi được thì kho token giữ nguyên', async () => {
    const { db, calls } = fakeDb();
    stubNetwork(DEAD_CHAIN);

    await adoptChainIfUsable(fakeEnv(db), 1, 'RT_MOI');

    expect(tokenWrite(calls)).toBeUndefined();
  });

  it('tin nhắn nêu mã lỗi Microsoft và không tuyên bố thành công', async () => {
    const { db } = fakeDb();
    const sent = stubNetwork(DEAD_CHAIN);

    await adoptChainIfUsable(fakeEnv(db), 1, 'RT_MOI');

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('AADSTS70000');
    expect(sent[0]).not.toContain('Bot ghi được rồi');
  });

  it('chuỗi mới đổi được thì ghi đè và báo thành công', async () => {
    const { db, calls } = fakeDb();
    const sent = stubNetwork({ access_token: 'AT_SONG', refresh_token: 'RT_SONG', expires_in: 3600 });

    await adoptChainIfUsable(fakeEnv(db), 1, 'RT_MOI');

    const write = tokenWrite(calls);
    expect(write?.args).toContain('RT_SONG');
    expect(write?.args).toContain('AT_SONG');
    expect(sent[0]).toContain('Bot ghi được rồi');
  });

  it('kho token trống thì nói thẳng là bot chưa ghi được, không hứa suông', async () => {
    const { db, calls } = fakeDb(null);
    const sent = stubNetwork(DEAD_CHAIN);

    await adoptChainIfUsable(fakeEnv(db), 1, 'RT_MOI');

    expect(tokenWrite(calls)).toBeUndefined();
    expect(sent[0]).toContain('bot chưa ghi được');
    expect(sent[0]).not.toContain('ghi bình thường');
  });

  it('đổi được access token mà không có chuỗi kế tiếp thì không cất gì cả', async () => {
    // Cất token vừa đem đi đổi là cất một chuỗi đã chết — đúng cái bẫy của ticket.
    const { db, calls } = fakeDb();
    const sent = stubNetwork({ access_token: 'AT_CUT', expires_in: 3600 });

    await adoptChainIfUsable(fakeEnv(db), 1, 'RT_MOI');

    expect(tokenWrite(calls)).toBeUndefined();
    expect(sent[0]).toContain('refresh token kế tiếp');
  });
});
