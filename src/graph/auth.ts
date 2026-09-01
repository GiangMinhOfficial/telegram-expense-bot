import { getToken, saveRotatedToken } from '../db';
import type { Env } from '../env';

export const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
export const SCOPE = 'Files.ReadWrite offline_access';
/** Làm mới sớm 5 phút để không dùng token sắp hết hạn giữa chừng. */
const SKEW_MS = 5 * 60 * 1000;

export class AuthExpiredError extends Error {}

export async function getAccessToken(env: Env): Promise<string> {
  const stored = await getToken(env.DB);
  // Kho trống thì chỉ còn một đường dựng lại: /reauth. Không còn secret nạp mồi nữa.
  if (!stored) throw new AuthExpiredError('Kho token trống — gửi /reauth để cấp quyền');

  if (stored.accessToken && stored.expiresAt - SKEW_MS > Date.now()) {
    return stored.accessToken;
  }

  // Không gửi client_secret: app đã bật "Allow public client flows" cho device
  // code, và từ lúc đó Microsoft không kiểm secret ở endpoint này nữa. Gửi một
  // giá trị không ai kiểm chỉ tạo cảm giác an toàn giả.
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
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
  // Thua cuộc đua thì bỏ token của mình đi, KHÔNG ghi đè: xem saveRotatedToken.
  // Access token vừa lấy vẫn sống hết giờ nên lượt chạy này cứ đi tiếp.
  await saveRotatedToken(env.DB, stored.refreshToken, {
    refreshToken: body.refresh_token ?? stored.refreshToken,
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });

  return body.access_token;
}
