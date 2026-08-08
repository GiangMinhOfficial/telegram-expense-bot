import type { Env } from './env';
import { drainOutbox } from './handlers/outbox';
import { handleUpdate, type TelegramUpdate } from './router';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'POST') return new Response('ok');

    // Lớp khoá 1: chỉ Telegram mới biết secret này.
    if (req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_SECRET) {
      return new Response('forbidden', { status: 403 });
    }

    let update: TelegramUpdate;
    try {
      update = await req.json<TelegramUpdate>();
    } catch {
      return new Response('ok');
    }

    // Lớp khoá 2: chỉ một người dùng. Người lạ không nhận được phản hồi nào.
    const from = update.message?.from?.id ?? update.callback_query?.from.id;
    if (String(from) !== env.ALLOWED_CHAT_ID) return new Response('ok');

    // Luôn trả 200, kể cả khi xử lý lỗi — mã khác sẽ khiến Telegram gửi lại liên tục.
    try {
      await handleUpdate(env, update);
    } catch (err) {
      console.error('handleUpdate', err);
    }
    return new Response('ok');
  },

  async scheduled(_ctrl: ScheduledController, env: Env): Promise<void> {
    await drainOutbox(env);
  },
} satisfies ExportedHandler<Env>;
