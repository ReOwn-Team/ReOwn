import type {
  LoginUserRequest,
  RegisterUserRequest,
  UserProfile,
} from "@reown/api-contract";
import { apiClient } from "../api/client";
import { AuthError, authError } from "./errors";
import { validProfile, validOtpChallenge } from "./profile";

export type AuthSnapshot = {
  status: "checking" | "authenticated" | "anonymous" | "error";
  user: UserProfile | null;
  error: string;
};
const initial: AuthSnapshot = { status: "checking", user: null, error: "" };
let snapshot = initial;
let initialized: Promise<void> | undefined;
let channel: BroadcastChannel | undefined;
let version = 0;
const listeners = new Set<() => void>();
function publish(next: AuthSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}
function accept(user: UserProfile | null) {
  publish({ status: user ? "authenticated" : "anonymous", user, error: "" });
}
function changed() {
  channel?.postMessage("changed");
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  captchaToken?: string,
) {
  try {
    return await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "X-ReOwn-Client": "web",
        ...(captchaToken ? { "X-HCaptcha-Response": captchaToken } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new AuthError(
      "Không nhận được phản hồi từ máy chủ. Vui lòng thử lại.",
    );
  }
}
async function read(response: Response, operation?: string) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw authError(
      response.status,
      body,
      operation,
      response.headers.get("Retry-After"),
    );
  return body;
}
async function load() {
  const current = ++version;
  try {
    const body = await read(await request("/api/auth/session"));
    const user = (body as { user?: unknown })?.user;
    if (user !== null && !validProfile(user))
      throw new AuthError("Phản hồi phiên không hợp lệ.");
    if (current === version) accept(user);
  } catch (error) {
    if (current !== version) return;
    if (error instanceof AuthError && error.status === 401) accept(null);
    else
      publish({
        status: "error",
        user: null,
        error:
          error instanceof Error
            ? error.message
            : "Không thể đọc phiên đăng nhập.",
      });
  }
}
async function authenticate(
  operation: "login" | "register",
  input: LoginUserRequest | RegisterUserRequest,
  captchaToken: string,
) {
  const body = await read(
    await request(`/api/auth/${operation}`, "POST", input, captchaToken),
    operation,
  );
  if (!validOtpChallenge(body))
    throw new AuthError("Phản hồi OTP không hợp lệ.");
  return body;
}

export const authSession = {
  reload: load,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (fallback?: AuthSnapshot) =>
    initialized ? snapshot : (fallback ?? snapshot),
  getServerSnapshot: () => initial,
  start(serverSnapshot?: AuthSnapshot) {
    if (initialized) return initialized;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("reown-server-session");
      channel.onmessage = (event) => {
        if (event.data === "changed") void load();
      };
    }
    window.addEventListener("focus", () => {
      void load();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void load();
    });
    if (serverSnapshot && serverSnapshot.status !== "checking") {
      publish(serverSnapshot);
      initialized = Promise.resolve();
    } else initialized = load();
    return initialized;
  },
  login: (input: LoginUserRequest, captchaToken: string) =>
    authenticate("login", input, captchaToken),
  register: (input: RegisterUserRequest, captchaToken: string) =>
    authenticate("register", input, captchaToken),
  async verifyOtp(challengeId: string, code: string) {
    const body = await read(
      await request("/api/auth/otp-verify", "POST", { challengeId, code }),
      "otp-verify",
    );
    const user = (body as { user?: unknown })?.user;
    if (!validProfile(user))
      throw new AuthError("Phản hồi đăng nhập không hợp lệ.");
    version++;
    accept(user);
    changed();
    return user;
  },
  async resendOtp(challengeId: string) {
    const body = await read(
      await request("/api/auth/otp-resend", "POST", { challengeId }),
      "otp-resend",
    );
    if (!validOtpChallenge(body))
      throw new AuthError("Phản hồi OTP không hợp lệ.");
    return body;
  },
  async logout() {
    const response = await request("/api/auth/logout", "POST");
    if (response.status !== 204) await read(response, "logout");
    version++;
    accept(null);
    changed();
  },
  async getProfile() {
    const { data, error, response } = await apiClient.GET("/api/v1/users/me");
    if (!response.ok || !data) throw authError(response.status, error);
    if (!validProfile(data)) throw new AuthError("Không thể đọc hồ sơ từ API.");
    if (snapshot.user?.id === data.id) publish({ ...snapshot, user: data });
    return data;
  },
  async updateProfile(displayName: string) {
    const { data, error, response } = await apiClient.PATCH(
      "/api/v1/users/me",
      { body: { displayName } },
    );
    if (!response.ok || !data) throw authError(response.status, error);
    if (!validProfile(data) || snapshot.user?.id !== data.id)
      throw authError(401);
    publish({ ...snapshot, user: data });
    changed();
    return data;
  },
};
apiClient.use({
  async onResponse({ response }) {
    if (response.status === 401 && typeof window !== "undefined") {
      version++;
      accept(null);
      changed();
    }
    return response;
  },
});
