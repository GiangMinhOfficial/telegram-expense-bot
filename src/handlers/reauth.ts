import { clearDeviceCode, getDeviceCode, putDeviceCode, saveToken } from '../db';
import type { Env } from '../env';
import { DeviceCodeError, redeemDeviceCode, startDeviceCode } from '../graph/device';
import { sendMessage } from '../telegram/api';
import { deviceCodePrompt, reauthDone } from '../telegram/format';

const MS_PER_MINUTE = 60_000;

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
      // Ghi đè vô điều kiện, KHÔNG dùng saveRotatedToken: đây là một lần cấp
      // quyền mới chứ không phải một vòng xoay của chuỗi cũ, nên chẳng có token
      // cũ nào để mà so. Đây cũng là đường duy nhất dựng lại kho khi nó trống.
      await saveToken(env.DB, {
        refreshToken: outcome.refreshToken,
        accessToken: outcome.accessToken,
        expiresAt: outcome.expiresAt,
      });
      await clearDeviceCode(env.DB);
      await sendMessage(env, chatId, reauthDone(outcome.refreshToken));
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
