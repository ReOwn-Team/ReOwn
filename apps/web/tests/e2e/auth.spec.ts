import { completeOtp } from "./fixtures";
import { test, expect, testPassword, type Page } from "./fixtures";
async function login(page: Page) {
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog
        .getByLabel("Email hoặc số điện thoại")
        .fill("nguyenan@example.com");
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
    await expect(dialog).toHaveCount(0);
}
test("registration uses the real contract, restores cookie session and stores no credentials", async ({
    page,
    context,
    authApi,
}) => {
    await page.goto("/account");
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog.getByRole("button", { name: "Đăng ký", exact: true }).click();
    await dialog.getByLabel("Họ và tên").fill("  Người dùng mới  ");
    await dialog.getByLabel("Email", { exact: true }).fill("NEW@example.com");
    await dialog
        .getByLabel("Số điện thoại", { exact: true })
        .fill("0912 345 678");
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill("short");
    await dialog.locator("button[type=submit]").click();
    await expect(dialog.getByRole("alert")).toContainText("12 đến 128");
    expect(
        authApi.requests.filter((r) => r.path.endsWith("register")),
    ).toHaveLength(0);
    const password = "  long-password-with-spaces  ";
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
    await expect(dialog).toHaveCount(0);
    expect(
        authApi.requests.find((r) => r.path.endsWith("register"))?.body,
    ).toEqual({
        displayName: "Người dùng mới",
        email: "new@example.com",
        phone: "+84912345678",
        password,
    });
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
        "new@example.com",
    );
    await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
        "readonly",
        "",
    );
    await page.reload();
    await expect(page.getByLabel("Tên hiển thị")).toHaveValue("Người dùng mới");
    expect(authApi.requests.some((r) => r.path.endsWith("refresh"))).toBe(
        false,
    );
    expect(authApi.requests.every((r) => !r.authorization)).toBe(true);
    expect(
        (await context.cookies()).find(
            (cookie) => cookie.name === "reown_web_session",
        )?.httpOnly,
    ).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
        "reown_web_session",
    );
    const storage = await page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("reown-demo-v2", 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const data = await new Promise<unknown>((resolve) => {
            const request = database
                .transaction("state")
                .objectStore("state")
                .get("current");
            request.onsuccess = () => resolve(request.result);
        });
        database.close();
        return {
            data,
            local: JSON.stringify({ ...localStorage }),
            session: JSON.stringify({ ...sessionStorage }),
        };
    });
    expect(storage.data).not.toHaveProperty("user");
    expect(JSON.stringify(storage)).not.toContain(password);
    expect(JSON.stringify(storage)).not.toContain("test-access-");
});
test("invalid credentials and rate limits cannot fake a login", async ({
    page,
    authApi,
}) => {
    await page.goto("/account");
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog
        .getByLabel("Email hoặc số điện thoại")
        .fill("nguyenan@example.com");
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill("wrong-password");
    await dialog.locator("button[type=submit]").click();
    await dialog.getByRole("button", { name: "Tôi là con người" }).click();
    await expect(dialog.getByRole("alert")).toContainText("không đúng");
    authApi.loginFailure = 429;
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await dialog.getByRole("button", { name: "Tôi là con người" }).click();
    await expect(dialog.getByRole("alert")).toContainText("quá nhiều");
    await expect(dialog.locator("button[type=submit]")).toBeDisabled();
    await expect(
        page.getByRole("link", { name: "Tài khoản Nguyễn An" }),
    ).toHaveCount(0);
});
test("profile PATCH sends only displayName through the BFF", async ({
    page,
    authApi,
}) => {
    await page.goto("/account");
    await login(page);
    await expect(page.getByLabel("Tên hiển thị")).toBeEnabled();
    const before = authApi.requests.filter((r) =>
        r.path.endsWith("refresh"),
    ).length;
    await page.getByLabel("Tên hiển thị").fill("Tên đã cập nhật");
    await page
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
    await expect(page.getByRole("status")).toContainText("Đã lưu thay đổi");
    expect(
        authApi.requests.filter((r) => r.path.endsWith("refresh")),
    ).toHaveLength(before);
    const patches = authApi.requests.filter(
        (r) => r.path.endsWith("me") && r.body.displayName,
    );
    expect(patches).toHaveLength(1);
    expect(
        patches.every(
            (r) =>
                JSON.stringify(r.body) ===
                JSON.stringify({ displayName: "Tên đã cập nhật" }),
        ),
    ).toBe(true);
    expect(patches[0].authorization).toBeUndefined();
    await page.reload();
    await expect(page.getByLabel("Tên hiển thị")).toHaveValue(
        "Tên đã cập nhật",
    );
});
test("logout failures retain the session and successful logout propagates between tabs", async ({
    page,
    context,
    authApi,
}) => {
    await page.goto("/account");
    await login(page);
    const second = await context.newPage();
    await second.goto("/account");
    await expect(second.getByLabel("Tên hiển thị")).toHaveValue("Nguyễn An");
    authApi.logoutFailure = 500;
    const menu = page.locator(".account-mobile-menu > summary");
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Máy chủ",
    );
    await expect(
        page.getByRole("link", { name: "Tài khoản Nguyễn An" }),
    ).toBeVisible();
    authApi.logoutFailure = null;
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Đăng nhập để quản lý tài khoản" }),
    ).toBeVisible();
    await expect(
        second.getByRole("heading", { name: "Đăng nhập để quản lý tài khoản" }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true }),
    ).toBeVisible();
});
test("parallel tabs restore the server session without browser token rotation", async ({
    page,
    context,
    authApi,
}) => {
    await page.goto("/account");
    await login(page);
    const second = await context.newPage();
    await second.goto("/account");
    await expect(second.getByLabel("Tên hiển thị")).toHaveValue("Nguyễn An");
    authApi.refreshDelay = 100;
    const before = authApi.requests.filter((r) =>
        r.path.endsWith("refresh"),
    ).length;
    await Promise.all([page.reload(), second.reload()]);
    await expect(page.getByLabel("Tên hiển thị")).toHaveValue("Nguyễn An");
    await expect(second.getByLabel("Tên hiển thị")).toHaveValue("Nguyễn An");
    const refreshes = authApi.requests
        .filter((r) => r.path.endsWith("refresh"))
        .slice(before);
    expect(refreshes).toHaveLength(0);

    expect(new Set(refreshes.map((r) => r.cookie)).size).toBe(refreshes.length);
});
test("session service failures show an error and recover on reload", async ({
    page,
    authApi,
}) => {
    await page.goto("/account");
    await login(page);
    authApi.refreshFailure = 503;
    await page.reload();
    await expect(
        page.getByRole("main").getByText(/Máy chủ chưa xử lý/),
    ).toBeVisible();
    authApi.refreshFailure = null;
    await page.reload();
    await expect(page.getByLabel("Tên hiển thị")).toHaveValue("Nguyễn An");
});
test("403 does not refresh and unsupported password operations send no fake requests", async ({
    page,
    authApi,
}, info) => {
    await page.goto("/account");
    await login(page);
    await expect(page.getByLabel("Tên hiển thị")).toBeEnabled();
    const before = authApi.requests.filter((r) =>
        r.path.endsWith("refresh"),
    ).length;
    authApi.profileFailure = 403;
    const mobile = info.project.name === "mobile";
    const navigation = page
        .locator(mobile ? ".account-mobile-menu" : ".account-sidebar")
        .getByRole("navigation", { name: "Quản lý tài khoản" });
    if (mobile) await page.locator(".account-mobile-menu > summary").click();
    await navigation
        .getByRole("link", { name: "Địa chỉ nhận hàng", exact: true })
        .click();
    if (mobile) await page.locator(".account-mobile-menu > summary").click();
    await navigation
        .getByRole("link", { name: "Tài khoản", exact: true })
        .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "không có quyền",
    );
    expect(
        authApi.requests.filter((r) => r.path.endsWith("refresh")),
    ).toHaveLength(before);
    await page.goto("/account?tab=security");
    await expect(
        page.getByRole("button", { name: "Đổi mật khẩu", exact: true }),
    ).toBeDisabled();
    expect(authApi.requests.some((r) => /password/.test(r.path))).toBe(false);
});

test("legacy IndexedDB identities cannot restore auth and password reset remains unavailable", async ({
    page,
}) => {
    await page.goto("/account");
    await expect(
        page.getByRole("heading", { name: "Đăng nhập để quản lý tài khoản" }),
    ).toBeVisible();
    await page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("reown-demo-v2", 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction("state", "readwrite");
            const store = transaction.objectStore("state");
            const request = store.get("current");
            request.onsuccess = () =>
                store.put(
                    {
                        ...request.result,
                        user: {
                            name: "Người từ mock",
                            email: "mock@example.com",
                            phone: "0901234567",
                        },
                    },
                    "current",
                );
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();
    });
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "Đăng nhập để quản lý tài khoản" }),
    ).toBeVisible();
    await expect(
        page.getByRole("link", { name: "Tài khoản Người từ mock" }),
    ).toHaveCount(0);
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "Quên mật khẩu?", exact: true })
        .click();
    await expect(
        page
            .locator("dialog.auth-dialog")
            .getByText(/Khôi phục mật khẩu chưa khả dụng/),
    ).toBeVisible();
    await expect(
        page.locator("dialog.auth-dialog").getByRole("textbox"),
    ).toHaveCount(0);
});

test("login remains usable when marketplace storage never finishes initializing", async ({
    page,
}) => {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error" && /hydrat/i.test(message.text()))
            hydrationErrors.push(message.text());
    });
    await page.addInitScript(() => {
        Object.defineProperty(indexedDB, "open", {
            value: () => new EventTarget(),
        });
    });
    await page.goto("/");
    const trigger = page.getByRole("button", {
        name: "Đăng nhập / Đăng ký",
        exact: true,
    });
    await expect(trigger).toBeEnabled();
    await login(page);
    await expect(
        page.getByRole("link", { name: "Tài khoản Nguyễn An", exact: true }),
    ).toBeVisible();
    expect(hydrationErrors).toEqual([]);
});

test("reload disables login until cookie restoration finishes", async ({
    page,
    authApi,
}) => {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error" && /hydrat/i.test(message.text()))
            hydrationErrors.push(message.text());
    });
    await page.goto("/products/camera");
    await login(page);
    authApi.refreshDelay = 1500;
    const before = authApi.requests.filter((request) =>
        request.path.endsWith("refresh"),
    ).length;
    for (let reload = 0; reload < 3; reload++) {
        await page.reload();
        await expect(
            page.getByRole("button", {
                name: "Đăng nhập / Đăng ký",
                exact: true,
            }),
        ).toBeDisabled();
        await expect(
            page.getByRole("button", {
                name: "Đăng nhập / Đăng ký",
                exact: true,
            }),
        ).toHaveAttribute("aria-busy", "true");
        if (reload === 0) {
            await page
                .locator(".product-purchase")
                .getByRole("button", { name: "Lưu sản phẩm", exact: true })
                .click();
            await expect(page.locator("dialog.auth-dialog")).toHaveCount(0);
        }
        await expect(
            page.getByRole("link", {
                name: "Tài khoản Nguyễn An",
                exact: true,
            }),
        ).toBeVisible();
        await expect(page.locator("dialog.auth-dialog")).toHaveCount(0);
        await expect(
            page
                .locator(".product-purchase")
                .getByRole("button", { name: "Bỏ lưu sản phẩm", exact: true }),
        ).toBeVisible();
    }
    expect(
        authApi.requests
            .filter((request) => request.path.endsWith("refresh"))
            .slice(before),
    ).toHaveLength(0);
    expect(hydrationErrors).toEqual([]);
});

test("saving waits for restoration failure before asking to log in", async ({
    page,
    authApi,
}) => {
    await page.goto("/products/camera");
    await login(page);
    authApi.refreshDelay = 1500;
    authApi.refreshFailure = 401;
    await page.reload();
    await expect(
        page.getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true }),
    ).toBeDisabled();
    await page
        .locator(".product-purchase")
        .getByRole("button", { name: "Lưu sản phẩm", exact: true })
        .click();
    await expect(page.locator("dialog.auth-dialog")).toHaveCount(0);
    const dialog = page.locator("dialog.auth-dialog");
    await expect(dialog).toBeVisible();
    authApi.refreshFailure = null;
    await dialog
        .getByLabel("Email hoặc số điện thoại")
        .fill("nguyenan@example.com");
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
    await expect(dialog).toHaveCount(0);
    await expect(
        page
            .locator(".product-purchase")
            .getByRole("button", { name: "Bỏ lưu sản phẩm", exact: true }),
    ).toBeVisible();
});

test("selling links require login and resume the intended selling page", async ({
    page,
}, info) => {
    await page.goto("/");
    await expect(
        page.getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true }),
    ).toBeVisible();
    const sellingEntry =
        info.project.name === "mobile"
            ? page.locator('.mobile-nav a[href="/sell"]')
            : page.locator(".header-sell");
    const entries = [
        sellingEntry,
        page
            .locator(".footer-cta")
            .getByRole("link", { name: "Đăng bán món đồ" }),
    ];
    for (const entry of entries) {
        await entry.click();
        await expect(page.locator("dialog.auth-dialog")).toBeVisible();
        await expect(page).toHaveURL(/\/$/);
        await page.keyboard.press("Escape");
        await expect(page.locator("dialog.auth-dialog")).toHaveCount(0);
    }
    await sellingEntry.click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog
        .getByLabel("Email hoặc số điện thoại")
        .fill("nguyenan@example.com");
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/sell$/);
    await expect(
        page.getByLabel("Tên sản phẩm", { exact: true }),
    ).toBeVisible();
});

test("direct selling URLs protect the new form and existing drafts", async ({
    page,
}) => {
    for (const route of ["/sell", "/sell?edit=demo-1"]) {
        await page.goto(route);
        await expect(
            page.getByRole("heading", {
                name: "Đăng nhập để đăng bán sản phẩm",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByLabel("Tên sản phẩm", { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Lưu bản nháp", exact: true }),
        ).toHaveCount(0);
    }
    await page.goto("/sell");
    await login(page);
    await expect(
        page.getByLabel("Tên sản phẩm", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByLabel("Tên sản phẩm", { exact: true }),
    ).toBeVisible();
});
