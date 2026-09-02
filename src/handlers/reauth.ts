import { getToken, putPendingAuth, saveToken } from '../db';
import type { Env } from '../env';
import { exchangeRefreshToken } from '../graph/auth';
import { OAUTH_CALLBACK_PATH, buildAuthorizeUrl, generatePkce, generateState } from '../graph/pkce';
import { sendMessage } from '../telegram/api';
import { reauthDone, reauthPrompt, reauthUnusable } from '../telegram/format';

/** Đủ rộng cho một người bấm link và đăng nhập, không cần bấm gấp. */
const PENDING_TTL_MS = 15 * 60_000;
/** Đổi được access token nhưng không có chuỗi kế tiếp thì cũng không cất được gì. */
const NO_NEXT_LINK = 'Đổi được access token nhưng không trả về refresh token kế tiếp.';

/**
 * Sinh một cặp PKCE + state mới, cất `code_verifier` lại chờ `/oauth/callback`,
 * rồi đưa người dùng link `/authorize` bấm thẳng trong Telegram.
 *
 * Không còn bước "gửi lại /reauth" như device code: Microsoft redirect thẳng
 * trình duyệt về Worker sau khi đăng nhập xong, `/oauth/callback` tự lo nốt.
 */
export async function handleReauth(env: Env, chatId: number, origin: string): Promise<void> {
  const pkce = await generatePkce();
  const state = generateState();
  await putPendingAuth(env.DB, {
    codeVerifier: pkce.verifier, state, expiresAt: Date.now() + PENDING_TTL_MS,
  });

  const redirectUri = `${origin}${OAUTH_CALLBACK_PATH}`;
  const authorizeUrl = buildAuthorizeUrl(env, redirectUri, pkce.challenge, state);
  await sendMessage(env, chatId, reauthPrompt(authorizeUrl));
}

/**
 * Đổi thử chuỗi vừa nhận, ghi đè người giữ chuỗi CHỈ KHI đổi được.
 *
 * Chuỗi vừa cấp có thể xin ra được mà không đổi được lần nào (đo được với
 * device code, AADSTS70000 — xem ticket 06). Ghi đè trước rồi mới biết là thay
 * chuỗi đang sống bằng chuỗi chết, mà access token còn hạn một giờ nên một
 * tiếng sau mới lộ ra.
 *
 * Đổi thử là một vòng xoay thật: token vừa nhận chết ngay sau đó, nên thứ cất
 * đi phải là thứ `exchangeRefreshToken` trả về. Dùng chung cho cả `/reauth`
 * (không còn gọi trực tiếp) lẫn `/oauth/callback` — bất kể chuỗi ban đầu tới
 * từ grant nào, cửa an toàn trước khi ghi đè vẫn phải như nhau.
 */
export async function adoptChainIfUsable(env: Env, chatId: number, refreshToken: string): Promise<void> {
  // Đọc TRƯỚC khi đổi thử: chỉ có kho lúc này mới nói được là nhánh hỏng còn
  // chuỗi cũ để giữ lại hay không, mà lời báo hỏng thì phải nói đúng điều đó.
  const kept = await getToken(env.DB);
  const probe = await exchangeRefreshToken(env, refreshToken);

  if (probe.kind === 'failed') {
    await sendMessage(env, chatId, reauthUnusable(probe.error, kept !== null));
    return;
  }
  // Cùng lý lẽ với trước: thiếu refresh token thì lần sau bot lại chết, thà
  // báo hỏng ngay còn hơn cất một chuỗi cụt.
  if (probe.refreshToken === null) {
    await sendMessage(env, chatId, reauthUnusable(NO_NEXT_LINK, kept !== null));
    return;
  }

  // Ghi đè vô điều kiện, KHÔNG dùng saveRotatedToken: đây là một lần cấp quyền
  // mới chứ không phải một vòng xoay của chuỗi cũ, nên chẳng có token cũ nào để
  // mà so. Đây cũng là đường duy nhất dựng lại kho khi nó trống. Mệnh đề bảo vệ
  // của đường này không phải "có token cũ" mà là "chuỗi mới vừa đổi được" ở trên.
  await saveToken(env.DB, {
    refreshToken: probe.refreshToken,
    accessToken: probe.accessToken,
    expiresAt: probe.expiresAt,
  });
  await sendMessage(env, chatId, reauthDone(probe.refreshToken));
}
