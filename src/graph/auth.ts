import { getToken, saveRotatedToken } from '../db';
import type { Env } from '../env';

export const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
export const SCOPE = 'Files.ReadWrite offline_access';
/** Làm mới sớm 5 phút để không dùng token sắp hết hạn giữa chừng. */
const SKEW_MS = 5 * 60 * 1000;

export class AuthExpiredError extends Error {}

export type RefreshOutcome =
  /** `refreshToken: null` = Microsoft không xoay chuỗi, token vừa đem đi đổi vẫn dùng tiếp được. */
  | { kind: 'ok'; refreshToken: string | null; accessToken: string; expiresAt: number }
  | { kind: 'failed'; error: string };

/**
 * Đổi một refresh token lấy access token. Đây cũng là phép thử duy nhất cho
 * câu hỏi "chuỗi này còn sống không" — xin được token không trả lời được câu đó.
 *
 * Đổi được thì chuỗi đã tiến lên một bước: token truyền vào coi như đã chết,
 * người gọi phải cất `refreshToken` trong kết quả chứ không phải token cũ.
 *
 * KHÔNG được gửi client_secret. App đăng ký là public client thật từ
 * 2026-09-02 (redirect URI chuyển sang platform "Mobile and desktop
 * applications", client secret đã xoá khỏi Azure) — endpoint trả AADSTS90023
 * "client secret not expected for a public client" nếu gửi kèm.
 */
export async function exchangeRefreshToken(
  env: Env, refreshToken: string,
): Promise<RefreshOutcome> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPE,
    }),
  });
  const body = await res.json<{
    access_token?: string; refresh_token?: string; expires_in?: number;
    error?: string; error_description?: string;
  }>();

  if (!res.ok || !body.access_token) {
    // Nguyên văn error_description vì mã AADSTS trong đó mới phân biệt được
    // "thiếu quyền" với "chuỗi không dùng được" — hai lỗi sửa theo hai cách khác nhau.
    return {
      kind: 'failed',
      error: body.error_description ?? body.error ?? `HTTP ${res.status}`,
    };
  }
  return {
    kind: 'ok',
    refreshToken: body.refresh_token ?? null,
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
}

export async function getAccessToken(env: Env): Promise<string> {
  const stored = await getToken(env.DB);
  // Kho trống thì chỉ còn một đường dựng lại: /reauth. Không còn secret nạp mồi nữa.
  if (!stored) throw new AuthExpiredError('Kho token trống — gửi /reauth để cấp quyền');

  if (stored.accessToken && stored.expiresAt - SKEW_MS > Date.now()) {
    return stored.accessToken;
  }

  const outcome = await exchangeRefreshToken(env, stored.refreshToken);
  if (outcome.kind === 'failed') {
    throw new AuthExpiredError(`Làm mới token thất bại: ${outcome.error}`);
  }

  // LƯU NGAY. Từ thời điểm này refresh token cũ đã bị vô hiệu ở phía Microsoft —
  // xác nhận bằng thực nghiệm ở BƯỚC 0, xem docs/SPIKE-RESULT.md.
  // Thua cuộc đua thì bỏ token của mình đi, KHÔNG ghi đè: xem saveRotatedToken.
  // Access token vừa lấy vẫn sống hết giờ nên lượt chạy này cứ đi tiếp.
  await saveRotatedToken(env.DB, stored.refreshToken, {
    refreshToken: outcome.refreshToken ?? stored.refreshToken,
    accessToken: outcome.accessToken,
    expiresAt: outcome.expiresAt,
  });

  return outcome.accessToken;
}
