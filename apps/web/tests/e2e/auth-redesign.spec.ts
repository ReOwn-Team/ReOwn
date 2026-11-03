import type { Locator, TestInfo } from "@playwright/test";
import {
    test,
    expect,
    testPassword,
    testUser,
    type AuthApi,
    type Page,
} from "./fixtures";

type Mode = "login" | "register";
const registration = {
    name: "Người dùng thiết kế",
    email: "auth-redesign@example.com",
    phone: "0912345678",
};

async function openAuth(page: Page) {
    await page.goto("/account");
    const trigger = page.getByRole("main").getByRole("button", {
        name: "Đăng nhập",
        exact: true,
    });
    await trigger.click();
    const dialog = page.locator("dialog.auth-dialog");
    await expect(dialog).toBeVisible();
    return { dialog, trigger };
}

async function selectMode(dialog: Locator, mode: Mode) {
    const group = dialog.getByRole("group", { name: "Đăng nhập hoặc đăng ký" });
    const login = group.getByRole("button", { name: "Đăng nhập", exact: true });
    const register = group.getByRole("button", {
        name: "Đăng ký",
        exact: true,
    });
    await (mode === "login" ? login : register).click();
    await expect(login).toHaveAttribute(
        "aria-pressed",
        String(mode === "login"),
    );
    await expect(register).toHaveAttribute(
        "aria-pressed",
        String(mode === "register"),
    );
    await expect(dialog.locator('button[type="submit"]')).toHaveText(
        mode === "login" ? "Đăng nhập" : "Đăng ký",
    );
}

async function fillCredentials(dialog: Locator, mode: Mode) {
    if (mode === "register") {
        await dialog
            .getByLabel("Họ và tên", { exact: true })
            .fill(registration.name);
        await dialog
            .getByLabel("Email", { exact: true })
            .fill(registration.email);
        await dialog
            .getByLabel("Số điện thoại", { exact: true })
            .fill(registration.phone);
    } else {
        await dialog
            .getByLabel("Email hoặc số điện thoại", { exact: true })
            .fill(testUser.email!);
    }
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
}

async function enterOtp(dialog: Locator, mode: Mode, authApi: AuthApi) {
    await fillCredentials(dialog, mode);
    const path = `/api/auth/${mode}`;
    const before = authApi.requests.filter(
        (request) => request.path === path,
    ).length;
    await dialog.locator('button[type="submit"]').click();
    const captcha = dialog.getByRole("button", {
        name: "Tôi là con người",
        exact: true,
    });
    await expect(captcha).toBeVisible();
    expect(
        authApi.requests.filter((request) => request.path === path),
    ).toHaveLength(before);
    await captcha.click();
    await expect(
        dialog.getByLabel("Mã xác nhận", { exact: true }),
    ).toBeFocused();
    await expect(dialog.locator(".otp-slot")).toHaveCount(6);
    await expect(dialog.locator('button[type="submit"]')).toHaveText(
        "Xác nhận",
    );
    await expect
        .poll(
            () =>
                authApi.requests.filter((request) => request.path === path)
                    .length,
        )
        .toBe(before + 1);
}

async function expectNoHorizontalOverflow(page: Page, dialog: Locator) {
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    document.documentElement.scrollWidth -
                    document.documentElement.clientWidth,
            ),
        )
        .toBeLessThanOrEqual(1);
    await expect
        .poll(() =>
            dialog.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return Math.max(-rect.left, rect.right - window.innerWidth);
            }),
        )
        .toBeLessThanOrEqual(1);
    for (const selector of [null, ".auth-layout", ".auth-body", "form"]) {
        const element = selector ? dialog.locator(selector) : dialog;
        await expect
            .poll(() =>
                element.evaluate((node) => node.scrollWidth - node.clientWidth),
            )
            .toBeLessThanOrEqual(1);
    }
}

async function expectLayout(page: Page, dialog: Locator) {
    const desktop = page.viewportSize()!.width > 767;
    const visual = dialog.locator(".auth-visual");
    if (desktop) {
        await expect(visual).toBeVisible();
        const logo = visual.getByRole("img", { name: "ReOwn", exact: true });
        await expect(logo).toBeVisible();
        await expect(logo).toHaveAttribute(
            "src",
            /(?:\/logo\.png|%2Flogo\.png)/i,
        );
        await expect
            .poll(() =>
                logo.evaluate(
                    (image) =>
                        image instanceof HTMLImageElement &&
                        image.complete &&
                        image.naturalWidth > 0,
                ),
            )
            .toBe(true);
        await expect
            .poll(async () => {
                const form = await dialog.locator(".auth-body").boundingBox();
                const panel = await visual.boundingBox();
                return (
                    !!form &&
                    !!panel &&
                    form.x + form.width <= panel.x + 1 &&
                    Math.abs(form.y - panel.y) <= 1
                );
            })
            .toBe(true);
        await expect
            .poll(async () => (await dialog.boundingBox())!.width)
            .toBeGreaterThanOrEqual(850);
        await expect
            .poll(async () => (await dialog.boundingBox())!.width)
            .toBeLessThanOrEqual(960);
    } else {
        await expect(visual).toBeHidden();
        await expect
            .poll(() =>
                dialog
                    .locator(".auth-layout")
                    .evaluate(
                        (element) =>
                            getComputedStyle(element)
                                .gridTemplateColumns.trim()
                                .split(/\s+/).length,
                    ),
            )
            .toBe(1);
    }
    await expectNoHorizontalOverflow(page, dialog);
}

async function screenshot(page: Page, info: TestInfo, name: string) {
    const path = info.outputPath(`${info.project.name}-${name}.png`);
    await page.screenshot({ path, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
}

test("login and registration use the responsive auth layout without horizontal overflow", async ({
    page,
}, info) => {
    const { dialog } = await openAuth(page);
    for (const mode of ["login", "register"] as const) {
        await selectMode(dialog, mode);
        await expect(
            dialog.getByLabel("Mật khẩu", { exact: true }),
        ).toBeVisible();
        if (mode === "login") {
            await expect(
                dialog.getByLabel("Email hoặc số điện thoại", { exact: true }),
            ).toBeVisible();
        } else {
            for (const label of ["Họ và tên", "Email", "Số điện thoại"]) {
                await expect(
                    dialog.getByLabel(label, { exact: true }),
                ).toBeVisible();
            }
        }
        await expectLayout(page, dialog);
        await screenshot(page, info, mode);
    }
});

for (const mode of ["login", "register"] as const) {
    test(`${mode} OTP preserves layout through invalid code, resend, back and success`, async ({
        page,
        context,
        authApi,
    }, info) => {
        authApi.otpResendAfter = 0;
        const { dialog } = await openAuth(page);
        await selectMode(dialog, mode);
        await expectLayout(page, dialog);
        const credentialsWidth = (await dialog.boundingBox())!.width;
        await enterOtp(dialog, mode, authApi);
        await expectLayout(page, dialog);
        if (page.viewportSize()!.width > 767) {
            await expect
                .poll(async () =>
                    Math.abs(
                        (await dialog.boundingBox())!.width - credentialsWidth,
                    ),
                )
                .toBeLessThanOrEqual(1);
        }
        await screenshot(page, info, `${mode}-otp`);

        const code = dialog.getByLabel("Mã xác nhận", { exact: true });
        // Filling all six digits must submit without clicking the confirmation CTA.
        await code.fill("000000");
        await expect(dialog.getByRole("alert")).toContainText("Mã không đúng");
        await expect(code).toHaveAttribute("aria-invalid", "true");
        await expect(dialog).toBeVisible();
        expect(
            (await context.cookies()).some(
                (cookie) => cookie.name === "reown_web_session",
            ),
        ).toBe(false);
        await screenshot(page, info, `${mode}-otp-invalid`);

        await dialog
            .getByRole("button", { name: "Gửi lại mã", exact: true })
            .click();
        await expect(code).toHaveValue("");
        await expect
            .poll(
                () =>
                    authApi.requests.filter(
                        (request) => request.path === "/api/auth/otp-resend",
                    ).length,
            )
            .toBe(1);
        await code.fill("123456");
        await expect(dialog.getByRole("alert")).toContainText("Mã không đúng");
        await dialog
            .getByRole("button", { name: "Quay lại", exact: true })
            .click();
        await expect(code).toHaveCount(0);
        await expect(
            dialog.getByLabel("Mật khẩu", { exact: true }),
        ).toHaveValue("");
        await expect(
            dialog
                .getByRole("group", { name: "Đăng nhập hoặc đăng ký" })
                .getByRole("button", {
                    name: mode === "login" ? "Đăng nhập" : "Đăng ký",
                    exact: true,
                }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(
            (await context.cookies()).some(
                (cookie) => cookie.name === "reown_web_session",
            ),
        ).toBe(false);
        await expectLayout(page, dialog);

        await enterOtp(dialog, mode, authApi);
        await dialog
            .getByRole("button", { name: "Gửi lại mã", exact: true })
            .click();
        await expect
            .poll(
                () =>
                    authApi.requests.filter(
                        (request) => request.path === "/api/auth/otp-resend",
                    ).length,
            )
            .toBe(2);
        await expect(code).toBeEnabled();
        await code.fill("654321");
        await expect(dialog).toHaveCount(0);
        await expect(
            page.getByLabel("Tên hiển thị", { exact: true }),
        ).toHaveValue(
            mode === "login" ? testUser.displayName : registration.name,
        );
        expect(
            authApi.requests
                .filter((request) => request.path === "/api/auth/otp-verify")
                .map((request) => request.body.code),
        ).toEqual(["000000", "123456", "654321"]);
    });
}

for (const state of ["login", "register", "otp"] as const) {
    test(`Escape closes ${state} and restores focus to the account login trigger`, async ({
        page,
        authApi,
    }) => {
        const { dialog, trigger } = await openAuth(page);
        if (state === "register") await selectMode(dialog, "register");
        if (state === "otp") await enterOtp(dialog, "login", authApi);
        if (state !== "otp")
            await dialog.getByLabel("Mật khẩu", { exact: true }).focus();
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(dialog).toBeVisible();
    });
}

for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 500 },
]) {
    test(`registration at ${viewport.width}x${viewport.height} keeps submit and close reachable`, async ({
        page,
    }, info) => {
        test.skip(
            info.project.name !== "mobile",
            "Small-screen coverage runs in the mobile project.",
        );
        await page.setViewportSize(viewport);
        const { dialog, trigger } = await openAuth(page);
        await selectMode(dialog, "register");
        await expectLayout(page, dialog);
        const close = dialog.getByRole("button", { name: "Đóng", exact: true });
        await close.click({ trial: true });
        await expect(close).toBeInViewport({ ratio: 1 });
        await fillCredentials(dialog, "register");
        const submit = dialog.locator('button[type="submit"]');
        await submit.scrollIntoViewIfNeeded();
        await submit.click({ trial: true });
        await expect(submit).toBeInViewport({ ratio: 1 });
        if (viewport.height === 500) {
            // Check the actual scrolling ancestor, not a particular implementation's container.
            await expect
                .poll(() =>
                    submit.evaluate((element) => {
                        for (
                            let parent = element.parentElement;
                            parent;
                            parent = parent.parentElement
                        ) {
                            if (
                                /auto|scroll/.test(
                                    getComputedStyle(parent).overflowY,
                                ) &&
                                parent.scrollHeight > parent.clientHeight + 1 &&
                                parent.scrollTop > 0
                            )
                                return true;
                        }
                        return false;
                    }),
                )
                .toBe(true);
        }
        await expectNoHorizontalOverflow(page, dialog);
        await screenshot(
            page,
            info,
            `register-${viewport.width}x${viewport.height}-submit`,
        );
        await submit.click();
        const captcha = page.getByRole("dialog", {
            name: "Xác minh bảo mật",
            exact: true,
        });
        await expect(
            captcha.getByRole("button", {
                name: "Tôi là con người",
                exact: true,
            }),
        ).toBeVisible();
        await captcha
            .getByRole("button", { name: "Đóng", exact: true })
            .click();
        await expect(captcha).toHaveCount(0);
        await expect(submit).toBeEnabled();
        await close.scrollIntoViewIfNeeded();
        await close.click({ trial: true });
        await expect(close).toBeInViewport({ ratio: 1 });
        await screenshot(
            page,
            info,
            `register-${viewport.width}x${viewport.height}-close`,
        );
        await close.click();
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
    });
}
