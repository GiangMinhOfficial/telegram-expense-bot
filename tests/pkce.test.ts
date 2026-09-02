import { describe, expect, it } from 'vitest';
import {
  buildAuthorizeUrl, generateCodeVerifier, generatePkce, generateState, sha256Base64Url,
} from '../src/graph/pkce';
import type { Env } from '../src/env';

function fakeEnv(): Env {
  return {
    DB: {} as D1Database,
    MS_CLIENT_ID: 'CID',
    DRIVE_ITEM_ID: 'X',
    TELEGRAM_BOT_TOKEN: 'X',
    TELEGRAM_SECRET: 'X',
    ALLOWED_CHAT_ID: '1',
  };
}

describe('generateCodeVerifier', () => {
  it('chỉ dùng ký tự "unreserved" của RFC 7636', () =>
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9\-._~]+$/));

  it('độ dài nằm trong khoảng 43–128 ký tự cho phép', () => {
    const len = generateCodeVerifier().length;
    expect(len).toBeGreaterThanOrEqual(43);
    expect(len).toBeLessThanOrEqual(128);
  });

  it('hai lần sinh ra hai chuỗi khác nhau', () =>
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier()));
});

describe('generateState', () => {
  it('hai lần sinh ra hai chuỗi khác nhau', () =>
    expect(generateState()).not.toBe(generateState()));
});

describe('sha256Base64Url', () => {
  // Vector chuẩn từ RFC 7636 Appendix B.
  it('khớp ví dụ chuẩn của RFC 7636', async () =>
    expect(await sha256Base64Url('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'));

  it('không chèn ký tự base64 chuẩn (+, /, =) — phải là base64url', async () => {
    const out = await sha256Base64Url('x'.repeat(50));
    expect(out).not.toMatch(/[+/=]/);
  });
});

describe('generatePkce', () => {
  it('challenge đúng bằng sha256Base64Url của chính verifier vừa sinh', async () => {
    const { verifier, challenge } = await generatePkce();
    expect(challenge).toBe(await sha256Base64Url(verifier));
  });
});

describe('buildAuthorizeUrl', () => {
  const url = new URL(buildAuthorizeUrl(
    fakeEnv(), 'https://worker.example.workers.dev/oauth/callback', 'CHALLENGE', 'STATE123',
  ));

  it('trỏ đúng endpoint /authorize của tenant consumers', () =>
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    ));

  it('mang đủ tham số PKCE + redirect_uri, KHÔNG có client_secret', () => {
    expect(url.searchParams.get('client_id')).toBe('CID');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('https://worker.example.workers.dev/oauth/callback');
    expect(url.searchParams.get('code_challenge')).toBe('CHALLENGE');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('STATE123');
    expect(url.searchParams.has('client_secret')).toBe(false);
  });
});
