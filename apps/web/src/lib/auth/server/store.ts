import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "redis";
import type { UserProfile } from "@reown/api-contract";

export type ServerSession = {
  user: UserProfile;
  accessToken: string;
  accessExpiresAt: number;
  refreshCookie: string;
  expiresAt: number;
  refreshing?: boolean;
};
export class SessionFailure extends Error {
  constructor(readonly status = 503) {
    super("Session unavailable");
  }
}
function makeClient(url: string) {
  return createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 1500,
      reconnectStrategy: (retries) => (retries < 2 ? 100 : false),
    },
  });
}
type Client = ReturnType<typeof makeClient>;
const globalStore = globalThis as typeof globalThis & {
  reownSessionRedis?: { client: Client; connecting?: Promise<unknown> };
};
export function sessionKey(id: string) {
  return `${process.env.WEB_SESSION_PREFIX ?? "reown:web:"}session:${createHash("sha256").update(id).digest("hex")}`;
}
export function validId(id: string | undefined): id is string {
  return !!id && /^[A-Za-z0-9_-]{43}$/.test(id);
}
export function newId() {
  return randomBytes(32).toString("base64url");
}
async function connection() {
  if (!globalStore.reownSessionRedis) {
    const url = process.env.REDIS_URL;
    if (!url || !["redis:", "rediss:"].includes(new URL(url).protocol))
      throw new SessionFailure();
    const client = makeClient(url);
    client.on("error", () => {
      /* Never log URLs or session credentials. */
    });
    globalStore.reownSessionRedis = { client };
  }
  const state = globalStore.reownSessionRedis;
  if (!state) throw new SessionFailure();
  if (!state.client.isOpen && !state.connecting) {
    state.connecting = state.client.connect().finally(() => {
      state.connecting = undefined;
    });
  }
  if (state.connecting) await state.connecting;
  if (!state.client.isReady) throw new SessionFailure();
  return state.client.withCommandOptions({ timeout: 1500 });
}
export async function command(args: string[]): Promise<unknown> {
  try {
    return await (await connection()).sendCommand(args);
  } catch {
    throw new SessionFailure();
  }
}
export async function readSession(id: string): Promise<ServerSession | null> {
  const value = await command(["GET", sessionKey(id)]);
  if (typeof value !== "string") return null;
  try {
    const session = JSON.parse(value) as ServerSession;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    throw new SessionFailure();
  }
}
export async function createSession(id: string, session: ServerSession) {
  await command([
    "SET",
    sessionKey(id),
    JSON.stringify(session),
    "PXAT",
    String(session.expiresAt),
  ]);
}
export async function removeSession(id: string) {
  await command(["DEL", sessionKey(id)]);
}

// Every writer must own this distributed lock, including when several Next.js
// instances receive refresh/profile/logout requests for the same cookie.
export async function withSession<T>(
  id: string,
  action: (
    session: ServerSession | null,
    save: (value: ServerSession) => Promise<void>,
  ) => Promise<T>,
): Promise<T> {
  const key = sessionKey(id);
  const lock = `${key}:lock`;
  const owner = newId();
  const deadline = Date.now() + 12000;
  while ((await command(["SET", lock, owner, "NX", "PX", "30000"])) !== "OK") {
    if (Date.now() >= deadline) throw new SessionFailure();
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  const save = async (value: ServerSession) => {
    const result = await command([
      "EVAL",
      "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[2],ARGV[2],'PXAT',ARGV[3]); return 1 else return 0 end",
      "2",
      lock,
      key,
      owner,
      JSON.stringify(value),
      String(value.expiresAt),
    ]);
    if (result !== 1) throw new SessionFailure();
  };
  try {
    return await action(await readSession(id), save);
  } finally {
    await command([
      "EVAL",
      "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
      "1",
      lock,
      owner,
    ]);
  }
}
