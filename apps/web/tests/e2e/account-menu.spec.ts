import {
    completeOtp,
    expect,
    test,
    testPassword,
    testUser,
    type Page,
} from "./fixtures";

const items = [
    { label: "Tài khoản của tôi", path: "/account" },
    { label: "Đơn mua", path: "/orders" },
    { label: "Tin đăng của tôi", path: "/listings" },
    { label: "Đơn bán", path: "/sales" },
];

async function signIn(page: Page) {
    await page.goto("/");
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog.getByLabel("Email hoặc số điện thoại").fill(testUser.email!);
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
}

test.describe("desktop account menu", () => {
    test.skip(({ isMobile }) => Boolean(isMobile), "Desktop navigation only");

    test("guest login still opens the sign-in dialog", async ({ page }) => {
        await page.goto("/");
        await page
            .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
            .click();
        await expect(page.locator("dialog.auth-dialog")).toBeVisible();
        await expect(page).toHaveURL(/\/$/);
    });

    test("click opens the account menu without navigating and Escape closes it", async ({
        page,
    }) => {
        await signIn(page);
        const account = page.getByRole("button", {
            name: "Tài khoản Nguyễn An",
            exact: true,
        });
        await account.click();
        await expect(page).toHaveURL(/\/$/);
        for (const { label } of items) {
            await expect(page.getByText(label, { exact: true })).toBeVisible();
        }
        await page.keyboard.press("Escape");
        for (const { label } of items) {
            await expect(
                page.getByText(label, { exact: true }),
            ).not.toBeVisible();
        }
        await expect(page).toHaveURL(/\/$/);
    });

    test("logout failure is visible and successful logout ends the session", async ({
        page,
        authApi,
    }) => {
        await signIn(page);
        await page
            .getByRole("button", { name: "Tài khoản Nguyễn An", exact: true })
            .click();
        authApi.logoutFailure = 500;
        await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
        await expect(
            page.locator(".header-account-menu").getByRole("alert"),
        ).toBeVisible();
        await expect(
            page.getByRole("button", {
                name: "Tài khoản Nguyễn An",
                exact: true,
            }),
        ).toBeVisible();
        authApi.logoutFailure = null;
        await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
        await expect(page).toHaveURL(/\/account$/);
        await expect(
            page.getByRole("button", {
                name: "Đăng nhập / Đăng ký",
                exact: true,
            }),
        ).toBeVisible();
    });

    test("hover opens the account menu without navigating", async ({
        page,
    }) => {
        await signIn(page);
        await page
            .getByRole("button", {
                name: "Tài khoản Nguyễn An",
                exact: true,
            })
            .hover();
        for (const { label } of items) {
            await expect(page.getByText(label, { exact: true })).toBeVisible();
        }
        await expect(page).toHaveURL(/\/$/);
    });

    for (const { label, path } of items) {
        test(`selecting ${label} navigates to ${path}`, async ({ page }) => {
            await signIn(page);
            await page
                .getByRole("button", {
                    name: "Tài khoản Nguyễn An",
                    exact: true,
                })
                .click();
            await expect(page).toHaveURL(/\/$/);
            await page.getByText(label, { exact: true }).click();
            await expect(page).toHaveURL(new RegExp(`${path}$`));
        });
    }
});
