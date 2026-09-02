import { clearDeviceCode, getDeviceCode, getToken, putDeviceCode, saveToken } from '../db';
import type { Env } from '../env';
import { exchangeRefreshToken } from '../graph/auth';
import { DeviceCodeError, redeemDeviceCode, startDeviceCode } from '../graph/device';
import { sendMessage } from '../telegram/api';
import { deviceCodePrompt, reauthDone, reauthUnusable } from '../telegram/format';

const MS_PER_MINUTE = 60_000;
/** Đổi được access token nhưng không có chuỗi kế tiếp thì cũng không cất được gì. */
const NO_NEXT_LINK = 'Đổi được access token nhưng không trả về refresh token kế tiếp.';

/**
 * Một lệnh, hai việc: chưa có mã thì xin mã, đang giữ mã thì đem đi đổi lấy quyền.
 *
 * Worker không ngồi chờ hết 15 phút của một device code được, nên chính người
 * dùng là nhịp hỏi lại: đăng nhập xong thì gửi /reauth lần nữa.
 */
export async function handleReauth(env: Env, chatId: number): Promise<void> {
  const pending = await getDeviceCode(env.DB);
  if (pending && pending.expiresAt > Date.now()) {
    await completeReauth(env, chatId, pending.deviceCode);
    return;
  }
  await beginReauth(env, chatId);
}

async function beginReauth(env: Env, chatId: number): Promise<void> {
  let code;
  try {
    code = await startDeviceCode(env);
  } catch (err) {
    const why = err instanceof DeviceCodeError ? err.message : String(err);
    await sendMessage(
      env, chatId,
      `⚠️ Không xin được mã: ${why}\n`
      + 'Nếu lỗi nhắc tới "mobile" thì app trên Azure chưa bật "Allow public client flows".',
    );
    return;
  }

  await putDeviceCode(env.DB, {
    deviceCode: code.deviceCode, expiresAt: code.expiresAt, intervalS: code.intervalS,
  });
  const minutes = Math.round((code.expiresAt - Date.now()) / MS_PER_MINUTE);
  await sendMessage(env, chatId, deviceCodePrompt(code.userCode, code.verificationUri, minutes));
}

async function completeReauth(env: Env, chatId: number, deviceCode: string): Promise<void> {
  const outcome = await redeemDeviceCode(env, deviceCode);
  switch (outcome.kind) {
    case 'ok':
      await adoptChainIfUsable(env, chatId, outcome.refreshToken);
      return;
    case 'pending':
      await sendMessage(env, chatId, '⏳ Chưa thấy đăng nhập xong. Xong rồi thì gửi lại /reauth.');
      return;
    case 'declined':
      await clearDeviceCode(env.DB);
      await sendMessage(env, chatId, '🚫 Bạn đã từ chối cấp quyền. Gửi /reauth nếu muốn làm lại.');
      return;
    case 'expired':
    case 'bad_code':
      await clearDeviceCode(env.DB);
      await sendMessage(env, chatId, '⌛ Mã đã hết hiệu lực. Gửi /reauth để lấy mã mới.');
      return;
    case 'unknown':
      await sendMessage(env, chatId, `⚠️ Microsoft trả lỗi lạ: ${outcome.error}`);
      return;
  }
}

/**
 * Đổi thử chuỗi vừa nhận, ghi đè người giữ chuỗi CHỈ KHI đổi được.
 *
 * Chuỗi do device code sinh ra có thể xin ra được mà không đổi được lần nào
 * (AADSTS70000). Ghi đè trước rồi mới biết là thay chuỗi đang sống bằng chuỗi
 * chết, mà access token còn hạn một giờ nên một tiếng sau mới lộ ra.
 *
 * Đổi thử là một vòng xoay thật: token vừa nhận chết ngay sau đó, nên thứ cất
 * đi phải là thứ `exchangeRefreshToken` trả về.
 */
async function adoptChainIfUsable(env: Env, chatId: number, refreshToken: string): Promise<void> {
  // Đọc TRƯỚC khi đổi thử: chỉ có kho lúc này mới nói được là nhánh hỏng còn
  // chuỗi cũ để giữ lại hay không, mà lời báo hỏng thì phải nói đúng điều đó.
  const kept = await getToken(env.DB);
  const probe = await exchangeRefreshToken(env, refreshToken);

  // Device code đã tiêu rồi (đổi xong là mất hiệu lực) nên xoá ở cả hai nhánh:
  // giữ lại chỉ khiến lần /reauth sau đâm vào một mã chắc chắn hỏng.
  await clearDeviceCode(env.DB);

  if (probe.kind === 'failed') {
    await sendMessage(env, chatId, reauthUnusable(probe.error, kept !== null));
    return;
  }
  // Cùng lý lẽ với classifyDeviceCode: thiếu refresh token thì lần sau bot lại
  // chết, thà báo hỏng ngay còn hơn cất một chuỗi cụt.
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
