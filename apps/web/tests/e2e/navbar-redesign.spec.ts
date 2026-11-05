import {
    completeOtp,
    expect,
    test,
    testPassword,
    testUser,
    type Page,
} from "./fixtures";

async function signIn(page: Page) {
    await page.goto("/");
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .first()
        .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email hoặc số điện thoại").fill(testUser.email!);
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
}

test.describe("desktop navigation", () => {
    test.skip(({ isMobile }) => Boolean(isMobile), "Desktop navigation only");

    test("desktop header stays visible while scrolling", async ({ page }) => {
        await page.goto("/");
        const header = page.locator(".site-header");
        await page.evaluate(() => window.scrollTo(0, 600));
        await expect
            .poll(async () => Math.abs((await header.boundingBox())!.y))
            .toBeLessThanOrEqual(1);
        await expect(
            header.getByRole("searchbox", { name: "Tìm kiếm sản phẩm" }),
        ).toBeVisible();
    });

    test("search and navigation links update the destination and active state", async ({
        page,
    }) => {
        await page.goto("/");
        const search = page
            .getByRole("banner")
            .getByRole("searchbox", { name: "Tìm kiếm sản phẩm" });
        await search.fill("laptop");
        await search.press("Enter");
        await expect(page).toHaveURL(/\/browse\?q=laptop$/);

        const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
        const recent = nav.getByRole("link", { name: "Đã xem gần đây" });
        await recent.click();
        await expect(page).toHaveURL(/\/browse\?viewed=1$/);
        await expect(recent).toHaveAttribute("aria-current", "page");
        await expect(
            nav.getByRole("link", { name: "Sản phẩm mới đăng" }),
        ).not.toHaveAttribute("aria-current", "page");
    });

    test("account menu is operable with the keyboard", async ({ page }) => {
        await signIn(page);
        const account = page.getByRole("button", {
            name: "Tài khoản Nguyễn An",
            exact: true,
        });
        await account.focus();
        await page.keyboard.press("Enter");
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        await expect(
            menu.getByRole("menuitem", { name: "Tài khoản của tôi" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).not.toBeVisible();
        await expect(account).toBeFocused();
        await expect(page).toHaveURL(/\/$/);
    });
});

test.describe("mobile navigation", () => {
    test.skip(({ isMobile }) => !isMobile, "Mobile navigation only");

    test("brand bar stays at the top while the community row scrolls away", async ({
        page,
    }) => {
        await page.goto("/");
        const bar = page.locator(".site-header .header-top");
        const community = page.locator(".site-header .header-secondary");
        await page.evaluate(() => window.scrollTo(0, 600));
        await expect
            .poll(async () => Math.abs((await bar.boundingBox())!.y))
            .toBeLessThanOrEqual(1);
        await expect
            .poll(async () => (await community.boundingBox())!.y)
            .toBeLessThan(0);
        await expect(
            page.getByRole("button", { name: "Mở menu điều hướng" }),
        ).toBeVisible();
        await expect(page.locator(".mobile-glass-nav")).toBeVisible();
    });

    test("menu opens by keyboard, navigates, and restores focus on Escape", async ({
        page,
    }) => {
        await page.goto("/");
        const trigger = page.getByRole("button", {
            name: "Mở menu điều hướng",
        });
        await trigger.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", { name: "Menu điều hướng" });
        await expect(dialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await dialog.getByRole("link", { name: "Khám phá sản phẩm" }).click();
        await expect(page).toHaveURL(/\/browse$/);
        await expect(dialog).not.toBeVisible();
        await expect(
            page
                .getByRole("navigation", { name: "Điều hướng mobile" })
                .getByRole("link", { name: "Khám phá" }),
        ).toHaveAttribute("aria-current", "page");
    });

    test("mobile search opens, returns focus, and submits a query", async ({
        page,
    }) => {
        await page.goto("/");
        const trigger = page.getByRole("button", { name: "Mở tìm kiếm" });
        await trigger.click();
        const dialog = page.getByRole("dialog", { name: "Tìm kiếm sản phẩm" });
        const search = dialog.getByRole("searchbox", {
            name: "Tìm kiếm sản phẩm",
        });
        await expect(search).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await search.fill("điện thoại");
        await search.press("Enter");
        await expect(page).toHaveURL(/\/browse\?q=/);
        expect(new URL(page.url()).searchParams.get("q")).toBe("điện thoại");
    });

    test("account tab handles guest sign-in and authenticated navigation", async ({
        page,
    }) => {
        await signIn(page);
        const nav = page.getByRole("navigation", { name: "Điều hướng mobile" });
        const account = nav.getByRole("link", { name: "Tài khoản Nguyễn An" });
        await account.click();
        await expect(page).toHaveURL(/\/account$/);
        await expect(account).toHaveAttribute("aria-current", "page");
    });
});

test("navigation does not cause horizontal page overflow", async ({
    page,
    isMobile,
}) => {
    const widths = isMobile ? [320, 390] : [768, 1024, 1440];
    await page.goto("/");
    for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        await expect
            .poll(
                () =>
                    page.evaluate(
                        () =>
                            document.documentElement.scrollWidth -
                            document.documentElement.clientWidth,
                    ),
                { message: `horizontal overflow at ${width}px` },
            )
            .toBeLessThanOrEqual(0);
    }
});
