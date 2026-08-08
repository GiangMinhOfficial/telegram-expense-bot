import { getToken, saveToken } from '../db';
import type { Env } from '../env';

const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const SCOPE = 'Files.ReadWrite offline_access';
/** Làm mới sớm 5 phút để không dùng token sắp hết hạn giữa chừng. */
const SKEW_MS = 5 * 60 * 1000;

export class AuthExpiredError extends Error {}

export async function getAccessToken(env: Env): Promise<string> {
  let stored = await getToken(env.DB);

  // Lần chạy đầu: nạp refresh token khởi tạo từ secret vào D1.
  if (!stored) {
    if (!env.MS_REFRESH_TOKEN) throw new AuthExpiredError('Chưa có refresh token trong D1');
    stored = { refreshToken: env.MS_REFRESH_TOKEN, accessToken: null, expiresAt: 0 };
  }

  if (stored.accessToken && stored.expiresAt - SKEW_MS > Date.now()) {
    return stored.accessToken;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
      scope: SCOPE,
    }),
  });
  const body = await res.json<{
    access_token?: string; refresh_token?: string; expires_in?: number;
    error?: string; error_description?: string;
  }>();

  if (!res.ok || !body.access_token) {
    throw new AuthExpiredError(`Làm mới token thất bại: ${body.error ?? res.status}`);
  }

  // LƯU NGAY. Từ thời điểm này refresh token cũ đã bị vô hiệu ở phía Microsoft —
  // xác nhận bằng thực nghiệm ở BƯỚC 0, xem docs/SPIKE-RESULT.md.
  await saveToken(env.DB, {
    refreshToken: body.refresh_token ?? stored.refreshToken,
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });

  return body.access_token;
}
