import { clearPendingAuth, getPendingAuth } from '../db';
import type { Env } from '../env';
import { exchangeAuthCode } from '../graph/auth';
import { OAUTH_CALLBACK_PATH } from '../graph/pkce';
import { sendMessage } from '../telegram/api';
import { reauthCodeFailed } from '../telegram/format';
import { adoptChainIfUsable } from './reauth';

const NO_REFRESH_TOKEN = 'Đổi được access token nhưng không có refresh token kèm theo.';

/**
 * Trang tĩnh, không bao giờ chèn dữ liệu từ query string vào — lỗi thật (mã
 * AADSTS, error_description) chỉ đi qua Telegram (đã thoát HTML ở
 * `reauthCodeFailed`). Route này không xác thực bằng gì ngoài `state` khớp
 * pending, nên bất kỳ ai cũng gọi được với query tuỳ ý.
 */
const html = (body: string, status = 200): Response =>
  new Response(
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif">${body}</body>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

/**
 * Đích của redirect Microsoft sau khi người dùng đăng nhập ở `/authorize`
 * (xem `handleReauth`). Đổi `code` lấy token bằng PKCE (không secret), rồi
 * chạy qua đúng cửa an toàn `adoptChainIfUsable` trước khi ghi kho token.
 *
 * `state` là hàng rào duy nhất: route này không có cách nào khác xác thực
 * người gọi, nên chỉ báo lỗi qua Telegram (và chỉ tin `code`) sau khi `state`
 * khớp đúng bản ghi `pending_auth` đang chờ.
 */
export async function handleOAuthCallback(env: Env, url: URL): Promise<Response> {
  const state = url.searchParams.get('state');
  const pending = await getPendingAuth(env.DB);

  if (!state || !pending || pending.state !== state) {
    return html('Link không hợp lệ hoặc đã hết hạn. Gửi /reauth trong Telegram để lấy link mới.', 400);
  }
  // Dùng một lần: xoá ngay khi state đã khớp, bất kể các bước sau có thành hay không.
  await clearPendingAuth(env.DB);

  const chatId = Number(env.ALLOWED_CHAT_ID);

  if (pending.expiresAt < Date.now()) {
    await sendMessage(env, chatId, reauthCodeFailed('Link đã hết hạn (quá 15 phút).'));
    return html('Link đã hết hạn. Gửi /reauth trong Telegram để lấy link mới.', 400);
  }

  const msError = url.searchParams.get('error');
  if (msError) {
    const desc = url.searchParams.get('error_description') ?? msError;
    await sendMessage(env, chatId, reauthCodeFailed(desc));
    return html('Đăng nhập không thành công — xem chi tiết trong Telegram.', 400);
  }

  const code = url.searchParams.get('code');
  if (!code) {
    await sendMessage(env, chatId, reauthCodeFailed('Thiếu code trong redirect.'));
    return html('Thiếu code trong redirect — xem chi tiết trong Telegram.', 400);
  }

  const redirectUri = `${url.origin}${OAUTH_CALLBACK_PATH}`;
  const outcome = await exchangeAuthCode(env, code, pending.codeVerifier, redirectUri);

  if (outcome.kind === 'failed') {
    await sendMessage(env, chatId, reauthCodeFailed(outcome.error));
    return html('Đổi code lấy token thất bại — xem chi tiết trong Telegram.', 400);
  }
  if (outcome.refreshToken === null) {
    await sendMessage(env, chatId, reauthCodeFailed(NO_REFRESH_TOKEN));
    return html('Thiếu refresh token — xem chi tiết trong Telegram.', 400);
  }

  await adoptChainIfUsable(env, chatId, outcome.refreshToken);
  return html('✅ Đã xử lý xong. Quay lại Telegram để xem kết quả.');
}
