import type { Env } from '../env';
import { SCOPE } from './auth';

const AUTHORIZE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
const VERIFIER_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/**
 * Đường dẫn route nhận redirect từ Microsoft. Dùng chung giữa `src/index.ts`
 * (khớp route), `handleReauth` (sinh redirect_uri gửi kèm /authorize) và
 * `handleOAuthCallback` (dựng lại đúng redirect_uri đó để đổi code) — ba nơi
 * PHẢI khớp y hệt nhau, Microsoft đối chiếu redirect_uri ở bước đổi code với
 * đúng chuỗi đã gửi lúc /authorize.
 */
export const OAUTH_CALLBACK_PATH = '/oauth/callback';

export interface Pkce { verifier: string; challenge: string }

/** RFC 7636 cho phép 43–128 ký tự "unreserved"; lấy 96 cho dư an toàn. */
export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(96));
  return Array.from(bytes, (b) => VERIFIER_CHARS[b % VERIFIER_CHARS.length]).join('');
}

/** Chống CSRF: đối chiếu lại giá trị này khi Microsoft redirect code về /oauth/callback. */
export function generateState(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** code_challenge = BASE64URL(SHA256(code_verifier)), phương thức S256 (RFC 7636). */
export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64Url(digest);
}

export async function generatePkce(): Promise<Pkce> {
  const verifier = generateCodeVerifier();
  return { verifier, challenge: await sha256Base64Url(verifier) };
}

export function buildAuthorizeUrl(
  env: Env, redirectUri: string, challenge: string, state: string,
): string {
  const params = new URLSearchParams({
    client_id: env.MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}
