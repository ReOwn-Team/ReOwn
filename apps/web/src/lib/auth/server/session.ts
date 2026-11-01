import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { AuthResponse } from "@reown/api-contract";
import { validProfile, validOtpChallenge } from "../profile";
import { clientIdentityHeaders } from "./client-identity";
import {
    createSession,
    newId,
    readSession,
    removeSession,
    SessionFailure,
    validId,
    withSession,
    type ServerSession,
} from "./store";

const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export function webOrigin() {
    const origin = process.env.WEB_ORIGIN ?? "http://localhost:3001";
    const url = new URL(origin);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol))
        throw new SessionFailure();
    // Permit HTTP only for explicit local development/testing, even in next start.
    if (
        url.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
        throw new SessionFailure();
    return origin;
}
export function cookieName() {
    return webOrigin().startsWith("https:")
        ? "__Host-reown_session"
        : "reown_web_session";
}
function cookieOptions() {
    return {
        httpOnly: true,
        secure: webOrigin().startsWith("https:"),
        sameSite: "lax" as const,
        path: "/",
    };
}
function json(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
}
function clearCookie(response: NextResponse) {
    response.cookies.set(cookieName(), "", { ...cookieOptions(), maxAge: 0 });
    return response;
}
export function checkMutation(request: NextRequest) {
    if (
        request.headers.get("origin") !== webOrigin() ||
        request.headers.get("x-reown-client") !== "web"
    )
        throw new SessionFailure(403);
}
async function requestBody(request: NextRequest) {
    const reader = request.body?.getReader();
    if (!reader) throw new SessionFailure(400);
    let length = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 16384) {
            await reader.cancel();
            throw new SessionFailure(413);
        }
        chunks.push(value);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
        throw new SessionFailure(400);
    }
}
async function upstream(
    path: string,
    method: string,
    session?: ServerSession,
    body?: unknown,
    request?: NextRequest,
) {
    const base = process.env.API_INTERNAL_URL ?? "http://localhost:3000";
    try {
        return await fetch(`${base.replace(/\/+$/, "")}${path}`, {
            method,
            cache: "no-store",
            redirect: "error",
            headers: {
                Origin: process.env.API_CLIENT_ORIGIN ?? webOrigin(),
                "X-ReOwn-Client": "web",
                ...clientIdentityHeaders(request),
                ...((path === "/api/v1/users/login" ||
                    path === "/api/v1/users/register") &&
                request?.headers.get("x-hcaptcha-response")
                    ? {
                          "X-HCaptcha-Response": request.headers.get(
                              "x-hcaptcha-response",
                          )!,
                      }
                    : {}),
                ...(body === undefined
                    ? {}
                    : { "Content-Type": "application/json" }),
                ...(session
                    ? {
                          Authorization: `Bearer ${session.accessToken}`,
                          Cookie: session.refreshCookie,
                      }
                    : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(
                path.startsWith("/api/v1/auth/otp/") ||
                    (path.startsWith("/api/v1/users/") && method === "POST")
                    ? 15000
                    : 8000,
            ),
        });
    } catch {
        throw new SessionFailure();
    }
}
async function authRecord(
    response: Response,
    previousExpiry?: number,
): Promise<ServerSession> {
    const auth: AuthResponse = await response.json();
    if (
        !validProfile(auth.user) ||
        typeof auth.accessToken !== "string" ||
        !auth.accessToken ||
        auth.tokenType !== "Bearer" ||
        auth.expiresIn !== 900
    )
        throw new SessionFailure();
    const cookies = response.headers.getSetCookie();
    const refresh = cookies.find((value) =>
        /^(?:__Secure-)?reown_refresh=/.test(value),
    );
    if (!refresh) throw new SessionFailure();
    const pair = refresh.split(";")[0];
    if (!/^(?:__Secure-)?reown_refresh=[A-Za-z0-9_-]+$/.test(pair))
        throw new SessionFailure();
    const expires = refresh.match(/;\s*Expires=([^;]+)/i)?.[1];
    const expiry = expires ? Date.parse(expires) : NaN;
    if (!Number.isFinite(expiry) || expiry <= Date.now())
        throw new SessionFailure();
    return {
        user: auth.user,
        accessToken: auth.accessToken,
        accessExpiresAt: Date.now() + auth.expiresIn * 1000,
        refreshCookie: pair,
        expiresAt: Math.min(expiry, previousExpiry ?? Date.now() + MAX_AGE),
    };
}
const KYC_ERRORS = [
    "KYC_RETAKE",
    "KYC_CARD_EXPIRED",
    "KYC_STUDENT_ID_IN_USE",
    "KYC_ALREADY_PENDING",
    "KYC_ALREADY_VERIFIED",
    "KYC_TOO_MANY_ATTEMPTS",
];
const KYC_ISSUES = [
    "FRONT_UNREADABLE",
    "FRONT_NO_FACE",
    "FRONT_FACE_TOO_SMALL",
    "FRONT_BLURRY",
    "FRONT_NOT_SUPPORTED",
    "FRONT_ID_UNREADABLE",
    "SELFIE_UNREADABLE",
    "SELFIE_NO_FACE",
    "SELFIE_MULTIPLE_FACES",
    "SELFIE_FACE_TOO_SMALL",
    "SELFIE_BLURRY",
    "SELFIE_NOT_FRONTAL",
    "SELFIE_BAD_LIGHT",
    "FACE_MISMATCH",
];
async function sanitizedError(response: Response) {
    // Only forward validation field names, never arbitrary upstream data/tokens.
    const body = await response.json().catch(() => null);
    const errors = Array.isArray(body?.errors)
        ? body.errors
              .filter(
                  (item: { field?: unknown }) =>
                      typeof item?.field === "string",
              )
              .map((item: { field: string }) => ({ field: item.field }))
        : [];
    const result = json(
        {
            errors,
            ...(body?.error === "PRODUCT_PHOTO_INVALID" &&
            Number.isInteger(body.imageIndex) &&
            body.imageIndex >= 0 &&
            body.imageIndex < 6 &&
            [
                "METADATA_UNREADABLE",
                "METADATA_REQUIRED",
                "ORIGINAL_REQUIRED",
                "FILE_TOO_LARGE",
                "IMAGE_DECODE_FAILED",
            ].includes(body.code)
                ? {
                      error: "PRODUCT_PHOTO_INVALID",
                      imageIndex: body.imageIndex,
                      code: body.code,
                      fields: Array.isArray(body.fields)
                          ? body.fields.filter(
                                (field: unknown) =>
                                    typeof field === "string" &&
                                    [
                                        "DateTimeOriginal",
                                        "GPSLatitude",
                                        "GPSLongitude",
                                    ].includes(field),
                            )
                          : [],
                  }
                : {}),
            ...(["HCAPTCHA_INVALID", "HCAPTCHA_UNAVAILABLE"].includes(
                body?.error,
            )
                ? { error: body.error }
                : {}),
            // KYC: forward only known codes so no upstream text or data can leak.
            ...(KYC_ERRORS.includes(body?.error)
                ? {
                      error: body.error,
                      ...(body.error === "KYC_RETAKE" &&
                      Array.isArray(body.issues)
                          ? {
                                issues: body.issues.filter((issue: unknown) =>
                                    KYC_ISSUES.includes(issue as string),
                                ),
                            }
                          : {}),
                  }
                : {}),
        },
        response.status,
    );
    const retry = response.headers.get("Retry-After");
    if (retry && /^\d+$/.test(retry)) result.headers.set("Retry-After", retry);
    return result;
}
async function refreshSession(
    id: string,
    session: ServerSession,
    save: (value: ServerSession) => Promise<void>,
    request: NextRequest,
) {
    if (session.refreshing) {
        await removeSession(id);
        throw new SessionFailure(401);
    }
    // Persist before rotating. If a worker dies or a response is lost, another
    // worker must not retry the old cookie after the lock expires.
    await save({ ...session, refreshing: true });
    try {
        const response = await upstream(
            "/api/v1/auth/refresh",
            "POST",
            session,
            undefined,
            request,
        );
        if (!response.ok) {
            if ([403, 429, 503].includes(response.status)) {
                await save(session);
                throw new SessionFailure(response.status);
            }
            await removeSession(id);
            throw new SessionFailure(response.status === 401 ? 401 : 503);
        }
        const next = await authRecord(response, session.expiresAt);
        await save(next);
        return next;
    } catch (error) {
        // A definite pre-rotation rejection has restored the old record above.
        // All other failures leave the persisted barrier in place (fail closed).
        throw error;
    }
}
export async function initialSession(id: string | undefined) {
    if (!validId(id))
        return { status: "anonymous" as const, user: null, error: "" };
    try {
        const session = await readSession(id);
        if (!session)
            return { status: "checking" as const, user: null, error: "" };
        if (!session.refreshing && session.accessExpiresAt > Date.now() + 30000)
            return {
                status: "authenticated" as const,
                user: session.user,
                error: "",
            };
    } catch {
        /* Route handler will return an actionable error after hydration. */
    }
    return { status: "checking" as const, user: null, error: "" };
}
export async function handleAuth(request: NextRequest, operation: string) {
    try {
        if (request.headers.get("sec-fetch-site") === "cross-site")
            throw new SessionFailure(403);
        if (request.method !== "GET") checkMutation(request);
        const id = request.cookies.get(cookieName())?.value;
        if (
            ["login", "register", "otp-verify", "otp-resend"].includes(
                operation,
            ) &&
            request.method === "POST"
        ) {
            // Require Redis before creating an upstream session.
            await readSession(newId());
            const body = await requestBody(request);
            const response = await upstream(
                operation.startsWith("otp-")
                    ? `/api/v1/auth/otp/${operation.slice(4)}`
                    : `/api/v1/users/${operation}`,
                "POST",
                undefined,
                body,
                request,
            );
            if (!response.ok) return sanitizedError(response);
            if (operation !== "otp-verify") {
                const challenge: unknown = await response.json();
                if (response.status !== 202 || !validOtpChallenge(challenge))
                    throw new SessionFailure();
                return json(
                    {
                        requiresOtp: true,
                        challengeId: challenge.challengeId,
                        emailHint: challenge.emailHint,
                        expiresIn: challenge.expiresIn,
                        resendAfter: challenge.resendAfter,
                    },
                    202,
                );
            }
            const session = await authRecord(response);
            const nextId = newId();
            await createSession(nextId, session);
            if (validId(id))
                await withSession(id, async () => {
                    await removeSession(id);
                });
            const result = json({ user: session.user });
            result.cookies.set(cookieName(), nextId, {
                ...cookieOptions(),
                expires: new Date(session.expiresAt),
            });
            return result;
        }
        if (operation !== "session" && operation !== "logout")
            return json({}, 404);
        if (
            (operation === "session" && request.method !== "GET") ||
            (operation === "logout" && request.method !== "POST")
        )
            return json({}, 405);
        if (!validId(id))
            return operation === "session"
                ? clearCookie(json({ user: null }))
                : clearCookie(
                      new NextResponse(null, {
                          status: 204,
                          headers: { "Cache-Control": "no-store" },
                      }),
                  );
        if (operation === "session") {
            const fresh = await readSession(id);
            if (
                fresh &&
                !fresh.refreshing &&
                fresh.accessExpiresAt > Date.now() + 30000
            )
                return json({ user: fresh.user });
        }
        return await withSession(id, async (session, save) => {
            if (!session)
                return clearCookie(
                    operation === "session"
                        ? json({ user: null })
                        : new NextResponse(null, { status: 204 }),
                );
            if (operation === "logout") {
                const response = await upstream(
                    "/api/v1/auth/logout",
                    "POST",
                    session,
                    undefined,
                    request,
                );
                if (response.status !== 204) return sanitizedError(response);
                await removeSession(id);
                return clearCookie(
                    new NextResponse(null, {
                        status: 204,
                        headers: { "Cache-Control": "no-store" },
                    }),
                );
            }
            if (
                session.refreshing ||
                session.accessExpiresAt <= Date.now() + 30000
            )
                session = await refreshSession(id, session, save, request);
            return json({ user: session.user });
        });
    } catch (error) {
        return failure(error);
    }
}
export async function handleProfile(request: NextRequest) {
    try {
        if (request.method === "PATCH") checkMutation(request);
        const id = request.cookies.get(cookieName())?.value;
        if (!validId(id)) throw new SessionFailure(401);
        const body =
            request.method === "PATCH" ? await requestBody(request) : undefined;
        return await withSession(id, async (session, save) => {
            if (!session) throw new SessionFailure(401);
            if (
                session.refreshing ||
                session.accessExpiresAt <= Date.now() + 30000
            )
                session = await refreshSession(id, session, save, request);
            let response = await upstream(
                "/api/v1/users/me",
                request.method,
                session,
                body,
                request,
            );
            if (response.status === 401) {
                session = await refreshSession(id, session, save, request);
                response = await upstream(
                    "/api/v1/users/me",
                    request.method,
                    session,
                    body,
                    request,
                );
                if (response.status === 401) await removeSession(id);
            }
            if (!response.ok) return sanitizedError(response);
            const user: unknown = await response.json();
            if (!validProfile(user)) throw new SessionFailure();
            await save({ ...session, user });
            return json(user);
        });
    } catch (error) {
        return failure(error);
    }
}
function failure(error: unknown) {
    const status = error instanceof SessionFailure ? error.status : 503;
    const response = json({}, status);
    return status === 401 ? clearCookie(response) : response;
}

// Resolve/rotate credentials under the distributed lock, then release it before
// potentially slow photo uploads. A 401 retries once using the latest grant.
export async function proxyWithSession(
    request: NextRequest,
    send: (session: ServerSession) => Promise<Response>,
) {
    try {
        if (request.method !== "GET") checkMutation(request);
        const id = request.cookies.get(cookieName())?.value;
        if (!validId(id)) throw new SessionFailure(401);
        const grant = await withSession(id, async (session, save) => {
            if (!session) throw new SessionFailure(401);
            return session.refreshing ||
                session.accessExpiresAt <= Date.now() + 30000
                ? refreshSession(id, session, save, request)
                : session;
        });
        let response = await send(grant);
        if (response.status === 401) {
            const next = await withSession(id, async (session, save) => {
                if (!session) throw new SessionFailure(401);
                return session.accessToken !== grant.accessToken &&
                    !session.refreshing
                    ? session
                    : refreshSession(id, session, save, request);
            });
            response = await send(next);
        }
        if (response.status === 401) {
            await removeSession(id);
            throw new SessionFailure(401);
        }
        if (!response.ok) return sanitizedError(response);
        return new NextResponse(
            response.status === 204 ? null : await response.arrayBuffer(),
            {
                status: response.status,
                headers: {
                    "Content-Type":
                        response.headers.get("content-type")?.split(";")[0] ===
                        "image/webp"
                            ? "image/webp"
                            : "application/json",
                    "Cache-Control": "private, no-store",
                },
            },
        );
    } catch (error) {
        return failure(error);
    }
}
