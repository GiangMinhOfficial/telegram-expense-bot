import type { Env } from '../env';
import { SCOPE, TOKEN_URL } from './auth';

const DEVICE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
/** Microsoft mặc định cho 15 phút; giữ làm mức dự phòng nếu thiếu expires_in. */
const DEFAULT_TTL_S = 900;

export class DeviceCodeError extends Error {}

export interface DeviceCode {
  /** Bí mật Worker giữ để hỏi Microsoft. Không bao giờ hiện ra chat. */
  deviceCode: string;
  /** Chuỗi ngắn người dùng gõ trên điện thoại. */
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalS: number;
}

export type PollOutcome =
  | { kind: 'ok'; refreshToken: string; accessToken: string; expiresAt: number }
  | { kind: 'pending' }
  | { kind: 'declined' }
  | { kind: 'expired' }
  | { kind: 'bad_code' }
  | { kind: 'unknown'; error: string };

interface TokenBody {
  access_token?: string; refresh_token?: string; expires_in?: number;
  error?: string; error_description?: string;
}

/**
 * Ánh xạ phản hồi của Microsoft về một kết cục.
 *
 * Hàm thuần, nhận `now` từ ngoài như parseMessage — nhờ vậy kiểm được đủ các
 * nhánh mà không phải giả lập fetch. Bốn mã lỗi là bảng "Expected errors" trong
 * tài liệu device authorization grant.
 */
export function classifyDeviceCode(b: TokenBody, now: number): PollOutcome {
  if (b.access_token && b.refresh_token) {
    return {
      kind: 'ok',
      refreshToken: b.refresh_token,
      accessToken: b.access_token,
      expiresAt: now + (b.expires_in ?? 3600) * 1000,
    };
  }
  switch (b.error) {
    // slow_down không có trong bảng của Microsoft nhưng RFC 8628 cho phép,
    // và ý nghĩa vẫn là "người dùng chưa xong".
    case 'authorization_pending':
    case 'slow_down':
      return { kind: 'pending' };
    case 'authorization_declined': return { kind: 'declined' };
    case 'expired_token': return { kind: 'expired' };
    case 'bad_verification_code': return { kind: 'bad_code' };
    default:
      return { kind: 'unknown', error: b.error_description ?? b.error ?? 'không rõ' };
  }
}

/** Xin một cặp mã mới. Ném DeviceCodeError kèm nguyên văn lời Microsoft nếu hỏng. */
export async function startDeviceCode(env: Env): Promise<DeviceCode> {
  const res = await fetch(DEVICE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.MS_CLIENT_ID, scope: SCOPE }),
  });
  const b = await res.json<{
    device_code?: string; user_code?: string; verification_uri?: string;
    expires_in?: number; interval?: number;
    error?: string; error_description?: string;
  }>();

  if (!b.device_code || !b.user_code || !b.verification_uri) {
    throw new DeviceCodeError(b.error_description ?? b.error ?? `HTTP ${res.status}`);
  }
  return {
    deviceCode: b.device_code,
    userCode: b.user_code,
    verificationUri: b.verification_uri,
    expiresAt: Date.now() + (b.expires_in ?? DEFAULT_TTL_S) * 1000,
    intervalS: b.interval ?? 5,
  };
}

/** Hỏi Microsoft xem người dùng đã đăng nhập xong chưa. */
export async function redeemDeviceCode(env: Env, deviceCode: string): Promise<PollOutcome> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      grant_type: DEVICE_GRANT,
      device_code: deviceCode,
    }),
  });
  return classifyDeviceCode(await res.json<TokenBody>(), Date.now());
}
