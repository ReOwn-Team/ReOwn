import {
    test as base,
    expect,
    type BrowserContext,
    type Page,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import type { ApiProduct } from "@/lib/products/client";
import { randomBytes, createHash } from "node:crypto";
import type { UserProfile } from "@reown/api-contract";
export { expect, type Page };
export const testPassword = "reown-test-password-2026";
export const testUser: UserProfile = {
    id: "031c2768-ac31-4000-8000-000000000001",
    displayName: "Nguyễn An",
    email: "nguyenan@example.com",
    phone: "+84901234567",
    avatarKey: null,
    emailVerified: 0,
    phoneVerified: 0,
    kycStatus: 0,
    role: "user",
    status: "active",
};
type RecordedRequest = {
    path: string;
    body: Record<string, unknown>;
    authorization: string | undefined;
    client: string | undefined;
    cookie: string | undefined;
};
export type AuthApi = {
    requests: RecordedRequest[];
    setUserRole: (role: UserProfile["role"]) => void;
    refreshFailure: number | "network" | null;
    logoutFailure: number | null;
    profileFailure: number | null;
    refreshDelay: number;
    loginFailure: number | null;
    otpResendAfter: number;
    approveProduct: (title: string) => void;
    photoFailure?: { imageIndex: number };
    uploadedPhotoHashes?: string[];
    /** Next KYC submission response; reset after use. */
    kycOutcome?: { status: number; body: unknown };
    kycStatus: "none" | "needs_review" | "verified" | "rejected";
    kycAvailable: boolean;
};
// UI fixture models the browser-facing BFF only. Actual Redis/rotation/locking
// are exercised against real Next.js in scripts/test-server-session.cjs.
async function install(
    context: BrowserContext,
    origin: string,
): Promise<AuthApi> {
    const users = new Map<string, UserProfile>([
        [testUser.id, { ...testUser }],
    ]);
    const passwords = new Map<string, string>([[testUser.id, testPassword]]);
    let cookie: string | null = null,
        cookieUser: string | null = null;
    const challenges = new Map<
        string,
        { user: UserProfile; password?: string; code: string }
    >();
    const products = new Map<string, ApiProduct>();
    const api: AuthApi = {
        requests: [],
        setUserRole(role) {
            users.get(testUser.id)!.role = role;
        },
        refreshFailure: null,
        logoutFailure: null,
        profileFailure: null,
        refreshDelay: 0,
        loginFailure: null,
        otpResendAfter: 60,
        kycStatus: "none",
        kycAvailable: true,
        approveProduct(title) {
            const product = [...products.values()].find(
                (item) => item.title === title,
            );
            if (!product) throw new Error("Unknown test product");
            product.reviewStatus = "approved";
            product.status = "published";
            product.publishedAt = new Date().toISOString();
        },
    };
    await context.route("https://js.hcaptcha.com/1/api.js**", (route) =>
        route.fulfill({
            contentType: "application/javascript",
            body: `window.hcaptcha={render(element,options){const button=document.createElement('button');button.type='button';button.textContent='Tôi là con người';button.onclick=()=>options.callback('10000000-aaaa-bbbb-cccc-000000000001');element.appendChild(button);return 'fixture';},remove(){}};window.__reownHcaptchaReady();`,
        }),
    );
    await context.route(`${origin}/api/**`, async (route) => {
        const request = route.request(),
            path = new URL(request.url()).pathname,
            headers = await request.allHeaders();
        const body = headers["content-type"]?.includes("application/json")
            ? (request.postDataJSON() ?? {})
            : {};
        api.requests.push({
            path,
            body,
            authorization: headers.authorization,
            client: headers["x-reown-client"],
            cookie: headers.cookie,
        });
        async function reply(
            status: number,
            data: unknown = {},
            extra: Record<string, string> = {},
        ) {
            await route.fulfill({
                status,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                    ...extra,
                },
                body: status === 204 ? undefined : JSON.stringify(data),
            });
        }
        function currentUser() {
            return cookie &&
                headers.cookie?.includes(`reown_web_session=${cookie}`) &&
                cookieUser
                ? users.get(cookieUser)
                : undefined;
        }
        async function authenticated(user: UserProfile) {
            cookie = randomBytes(32).toString("base64url");
            cookieUser = user.id;
            await reply(
                200,
                { user },
                {
                    "Set-Cookie": `reown_web_session=${cookie}; HttpOnly; SameSite=Lax; Path=/`,
                },
            );
        }
        if (request.method() !== "GET" && headers["x-reown-client"] !== "web") {
            await reply(403);
            return;
        }
        if (path.startsWith("/api/kyc/")) {
            const user = currentUser();
            if (!user) {
                await reply(401);
                return;
            }
            if (path === "/api/kyc/me" && request.method() === "GET") {
                await reply(200, {
                    available: api.kycAvailable,
                    consentVersion: "kyc-2026-11-v3",
                    status: api.kycStatus,
                    submittedAt: null,
                    reviewedAt: null,
                    reason:
                        api.kycStatus === "rejected" ? "Ảnh thẻ bị loá" : null,
                    requiresReverification: false,
                });
                return;
            }
            if (path === "/api/kyc/me" && request.method() === "DELETE") {
                api.kycStatus = "none";
                await reply(204);
                return;
            }
            if (
                path === "/api/kyc/submissions" &&
                request.method() === "POST"
            ) {
                const outcome = api.kycOutcome ?? {
                    status: 201,
                    body: { status: "needs_review" },
                };
                api.kycOutcome = undefined;
                if (outcome.status === 201) api.kycStatus = "needs_review";
                await reply(outcome.status, outcome.body);
                return;
            }
            await reply(404);
            return;
        }
        if (path.startsWith("/api/product-images/")) {
            await route.fulfill({
                status: 200,
                contentType: "image/png",
                body: readFileSync("public/figma/chair.png"),
            });
            return;
        }
        if (path.startsWith("/api/products")) {
            const segments = path
                .replace("/api/products", "")
                .split("/")
                .filter(Boolean);
            const method = request.method();
            const user = currentUser();
            if (method === "GET") {
                const mine = segments[0] === "mine";
                if (mine && !user) {
                    await reply(401);
                    return;
                }
                const id = mine ? segments[1] : segments[0];
                if (id) {
                    const product = products.get(id);
                    if (
                        !product ||
                        (mine
                            ? product.seller.id !== user!.id
                            : product.status !== "published")
                    ) {
                        await reply(404);
                        return;
                    }
                    if (segments[2] === "inspection") {
                        await reply(200, {
                            revision: product.revision,
                            reviewStatus: product.reviewStatus,
                            inspection: {
                                id: crypto.randomUUID(),
                                status: "completed",
                                attempts: 1,
                                promptVersion: "v2",
                                errorCode: null,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                                report: {
                                    summary: "Quan sát thấy vết nứt ở góc vỏ.",
                                    productObservations: [],
                                    visibleDefects: [
                                        {
                                            imageIds: [product.images[0].id],
                                            observation: "Vết nứt ở góc vỏ",
                                            evidence:
                                                "Góc dưới bên phải có đường nứt rõ",
                                            certainty: "high",
                                        },
                                    ],
                                    imageQuality: [],
                                    inconsistencies: [],
                                    limitations: [
                                        "Không kiểm tra được hoạt động qua ảnh.",
                                    ],
                                },
                            },
                        });
                        return;
                    }
                    await reply(200, product);
                    return;
                }
                await reply(
                    200,
                    [...products.values()].filter((item) =>
                        mine
                            ? item.seller.id === user!.id
                            : item.status === "published",
                    ),
                );
                return;
            }
            if (!user) {
                await reply(401);
                return;
            }
            if (method === "DELETE") {
                const product = products.get(segments[0]);
                if (!product || product.seller.id !== user.id) {
                    await reply(404);
                    return;
                }
                if (product.status === "sold") {
                    await reply(409);
                    return;
                }
                products.delete(product.id);
                await route.fulfill({ status: 204 });
                return;
            }
            if (method === "PATCH") {
                const product = products.get(segments[0]);
                if (!product || product.seller.id !== user.id) {
                    await reply(404);
                    return;
                }
                if (
                    body.status === "published" &&
                    product.reviewStatus !== "approved" &&
                    product.reviewStatus !== "not_required"
                ) {
                    await reply(409);
                    return;
                }
                product.status = body.status;
                await reply(200, product);
                return;
            }
            const form = await new Request(origin + path, {
                method: "POST",
                headers: { "Content-Type": headers["content-type"] },
                body: new Uint8Array(request.postDataBuffer()!),
            }).formData();
            if (api.photoFailure) {
                await reply(400, {
                    error: "PRODUCT_PHOTO_INVALID",
                    code: "METADATA_REQUIRED",
                    imageIndex: api.photoFailure.imageIndex,
                    fields: ["DateTimeOriginal", "GPSLatitude", "GPSLongitude"],
                });
                return;
            }
            api.uploadedPhotoHashes = await Promise.all(
                form.getAll("files").map(async (file) =>
                    createHash("sha256")
                        .update(Buffer.from(await (file as File).arrayBuffer()))
                        .digest("hex"),
                ),
            );
            const data = JSON.parse(String(form.get("data")));
            const existing = products.get(segments[0]);
            const value: ApiProduct = {
                id: existing?.id ?? data.requestId ?? crypto.randomUUID(),
                reviewStatus: "pending",
                revision: (existing?.revision ?? 0) + 1,
                rejectionReason: null,
                title: data.title,
                category: data.category,
                description: data.description,
                price: data.price,
                condition: data.condition,
                knownDefects: data.knownDefects,
                location: data.location,
                fulfillmentMethods: data.fulfillmentMethods,
                status: "hidden",
                seller: { id: user.id, displayName: user.displayName },
                publishedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                images: data.images.map((image: { id?: string }) => {
                    const id = image.id ?? crypto.randomUUID();
                    return {
                        id,
                        url: `/api/product-images/${id}`,
                        mimeType: "image/webp",
                        sizeBytes: 1000,
                    };
                }),
            };
            products.set(value.id, value);
            await reply(method === "POST" ? 201 : 200, value);
            return;
        }
        async function challenge(user: UserProfile, password?: string) {
            const challengeId = randomBytes(32).toString("base64url");
            challenges.set(challengeId, { user, password, code: "123456" });
            await reply(202, {
                requiresOtp: true,
                challengeId,
                emailHint: "n***@example.com",
                expiresIn: 300,
                resendAfter: api.otpResendAfter,
            });
        }
        if (path === "/api/auth/otp-verify") {
            const value = challenges.get(body.challengeId);
            if (!value || value.code !== body.code) {
                await reply(401);
                return;
            }
            challenges.delete(body.challengeId);
            value.user.emailVerified = 1;
            users.set(value.user.id, value.user);
            if (value.password) passwords.set(value.user.id, value.password);
            await authenticated(value.user);
            return;
        }
        if (path === "/api/auth/otp-resend") {
            const value = challenges.get(body.challengeId);
            if (!value) {
                await reply(401);
                return;
            }
            value.code = "654321";
            await reply(202, {
                requiresOtp: true,
                challengeId: body.challengeId,
                emailHint: "n***@example.com",
                expiresIn: 300,
                resendAfter: api.otpResendAfter,
            });
            return;
        }
        if (path === "/api/auth/login") {
            if (api.loginFailure) {
                await reply(api.loginFailure, {}, { "Retry-After": "2" });
                return;
            }
            const user = Array.from(users.values()).find((user) =>
                [user.email, user.phone].includes(String(body.identifier)),
            );
            if (!user || body.password !== passwords.get(user.id)) {
                await reply(401);
                return;
            }
            await challenge(user);
            return;
        }
        if (path === "/api/auth/register") {
            if (
                Array.from(users.values()).some(
                    (user) =>
                        user.email === body.email || user.phone === body.phone,
                )
            ) {
                await reply(409);
                return;
            }
            if (
                !body.displayName ||
                !String(body.email).includes("@") ||
                !/^\+[1-9]\d{7,14}$/.test(String(body.phone)) ||
                String(body.password).length < 12
            ) {
                await reply(400, { errors: [{ field: "password" }] });
                return;
            }
            const user = {
                ...testUser,
                id: crypto.randomUUID(),
                displayName: String(body.displayName),
                email: String(body.email),
                phone: String(body.phone),
            };
            await challenge(user, String(body.password));
            return;
        }
        if (path === "/api/auth/session") {
            if (api.refreshDelay)
                await new Promise((resolve) =>
                    setTimeout(resolve, api.refreshDelay),
                );
            if (api.refreshFailure === "network") {
                await route.abort("failed");
                return;
            }
            if (api.refreshFailure) {
                await reply(api.refreshFailure);
                return;
            }
            await reply(200, { user: currentUser() ?? null });
            return;
        }
        if (path === "/api/auth/logout") {
            if (api.logoutFailure) {
                await reply(api.logoutFailure);
                return;
            }
            cookie = null;
            cookieUser = null;
            await reply(204, undefined, {
                "Set-Cookie":
                    "reown_web_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/",
            });
            return;
        }
        if (path === "/api/v1/users/me") {
            if (api.profileFailure) {
                await reply(api.profileFailure);
                return;
            }
            const user = currentUser();
            if (!user) {
                await reply(401);
                return;
            }
            if (request.method() === "PATCH") {
                if (
                    Object.keys(body).length !== 1 ||
                    typeof body.displayName !== "string" ||
                    !body.displayName.trim()
                ) {
                    await reply(400);
                    return;
                }
                user.displayName = body.displayName.trim();
            }
            await reply(200, user);
            return;
        }
        await reply(404);
    });
    return api;
}
export const test = base.extend<{ authApi: AuthApi }>({
    authApi: [
        async ({ context, baseURL }, use) => {
            await use(await install(context, new URL(baseURL!).origin));
        },
        { auto: true },
    ],
});

export async function completeOtp(page: Page, code = "123456") {
    const dialog = page.locator("dialog.auth-dialog");
    await dialog.getByRole("button", { name: "Tôi là con người" }).click();
    // The sixth digit submits automatically.
    await dialog.getByLabel("Mã xác nhận", { exact: true }).fill(code);
    await expect(dialog).toHaveCount(0);
}
