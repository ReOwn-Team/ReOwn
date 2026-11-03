import { completeOtp } from "./fixtures";
import { test, expect, testPassword } from "./fixtures";

test("admin access and logout are in the account sidebar", async ({
    page,
    authApi,
}, info) => {
    authApi.setUserRole("admin");
    await page.goto("/account");
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .click();
    const dialog = page.getByRole("dialog");
    await dialog
        .getByLabel("Email hoặc số điện thoại")
        .fill("nguyenan@example.com");
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
    const sidebar = page.locator(
        info.project.name === "mobile"
            ? ".account-mobile-menu"
            : ".account-sidebar",
    );
    if (info.project.name === "mobile")
        await sidebar.locator("summary").click();
    await expect(
        sidebar.getByRole("link", { name: "Mở trang quản trị" }),
    ).toHaveAttribute("href", "/admin");
    await expect(
        sidebar.getByRole("button", { name: "Đăng xuất" }),
    ).toBeVisible();
    await expect(
        page
            .locator(".profile-panel")
            .getByRole("link", { name: "Mở trang quản trị" }),
    ).toHaveCount(0);
});

test("account navigation stays available across sections and order details", async ({
    page,
}, info) => {
    await page.goto("/account");
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .click();
    const dialog = page.getByRole("dialog");
    await dialog
        .getByLabel("Email hoặc số điện thoại")
        .fill("nguyenan@example.com");
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel("Tên hiển thị")).toBeVisible();
    const verification = page
        .locator(".profile-overview > div")
        .filter({ has: page.getByText("Xác thực danh tính", { exact: true }) });
    await expect(
        verification.getByRole("button", {
            name: "Xác thực bằng thẻ sinh viên",
        }),
    ).toBeVisible();
    await page
        .locator(".account-workspace")
        .evaluate((el) => el.setAttribute("data-preserved", "yes"));
    const mobile = info.project.name === "mobile";
    const nav = page
        .locator(mobile ? ".account-mobile-menu" : ".account-sidebar")
        .getByRole("navigation", { name: "Quản lý tài khoản" });
    async function navigate(label: string, url: RegExp) {
        if (mobile)
            await page.locator(".account-mobile-menu > summary").click();
        await nav.getByRole("link", { name: label, exact: true }).click();
        await expect(page).toHaveURL(url);
        await expect(page.locator(".account-workspace")).toHaveAttribute(
            "data-preserved",
            "yes",
        );
        if (mobile) {
            await expect(
                page.locator(".account-mobile-menu"),
            ).not.toHaveAttribute("open");
            await expect(
                page.locator(".account-mobile-menu > summary"),
            ).toContainText(label);
        } else
            await expect(
                nav.getByRole("link", { name: label, exact: true }),
            ).toHaveAttribute("aria-current", "page");
    }
    await navigate("Đơn mua", /\/orders$/);
    await page.locator('main a[href^="/orders/"]').first().click();
    await expect(page).toHaveURL(/\/orders\/.+/);
    await expect(page.locator(".account-workspace")).toHaveAttribute(
        "data-preserved",
        "yes",
    );
    await navigate("Đơn bán", /\/sales$/);
    await navigate("Tin đăng của tôi", /\/listings$/);
    await navigate("Địa chỉ nhận hàng", /\/account\?tab=addresses$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
    await navigate("Mật khẩu & bảo mật", /\/account\?tab=security$/);
    await navigate("Tài khoản", /\/account$/);
    await expect(page.getByLabel("Tên hiển thị")).toHaveValue("Nguyễn An");
    await page.screenshot({
        path: info.outputPath("account-workspace.png"),
        fullPage: true,
    });
});
