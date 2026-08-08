export interface Env {
  DB: D1Database;
  MS_CLIENT_ID: string;
  MS_CLIENT_SECRET: string;
  DRIVE_ITEM_ID: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_SECRET: string;
  ALLOWED_CHAT_ID: string;
  /** Chỉ dùng cho lần khởi tạo đầu tiên, sau đó token sống trong D1. */
  MS_REFRESH_TOKEN?: string;
}
