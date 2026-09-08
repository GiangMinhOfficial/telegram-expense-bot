import { clearAccessToken } from '../db';
import type { Env } from '../env';
import { getAccessToken } from './auth';

const BASE = 'https://graph.microsoft.com/v1.0';

export class GraphError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function graphFetch(
  env: Env, path: string, init: RequestInit = {},
): Promise<unknown> {
  const call = async (token: string) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });

  let res = await call(await getAccessToken(env));

  // 401 → access token chết sớm hơn dự kiến. Xoá cache, lấy lại, thử đúng một lần.
  if (res.status === 401) {
    await clearAccessToken(env.DB);
    res = await call(await getAccessToken(env));
  }

  if (!res.ok) {
    throw new GraphError(`${res.status} ${await res.text()}`.slice(0, 400), res.status);
  }
  return res.status === 204 ? null : await res.json();
}
