import {
    completeOtp,
    expect,
    test,
    testPassword,
    testUser,
    type Page,
} from "./fixtures";

async function signIn(page: Page) {
    await page.goto("/account");
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog.getByLabel("Email hoặc số điện thoại").fill(testUser.email!);
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
}

async function expectNoHorizontalOverflow(page: Page) {
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
    ).toBe(true);
}

test("installments require authentication", async ({ page }) => {
    await page.goto("/account?tab=installments");
    await expect(page.getByRole("heading", { name: /Đăng nhập để quản lý tài khoản/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /RO-DEMO-/ })).toHaveCount(0);
    await page.getByRole("main").getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page.locator("dialog.auth-dialog")).toBeVisible();
});

test("navigation selects installments and the one-period seed orders leave an empty summary", async ({ page }, info) => {
    await signIn(page);
    const mobile = info.project.name === "mobile";
    const menu = page.locator(mobile ? ".account-mobile-menu" : ".account-sidebar");
    if (mobile) await menu.locator("summary").click();
    const link = menu.getByRole("navigation", { name: "Quản lý tài khoản" })
        .locator('a[href="/account?tab=installments"]');
    await expect(link).toBeVisible();
    const label = (await link.innerText()).trim();
    expect(label).toMatch(/trả góp|trả sau|chia kỳ|chia theo tháng/i);
    await link.click();
    await expect(page).toHaveURL(/\/account\?tab=installments$/);
    if (mobile) {
        await expect(menu).not.toHaveAttribute("open");
        await expect(menu.locator("summary")).toContainText(label);
        await menu.locator("summary").click();
    }
    await expect(link).toHaveAttribute("aria-current", "page");
    if (mobile) await menu.locator("summary").click();

    const content = page.locator(".account-workspace-content");
    await expect(content).toContainText(/chưa có|không có/i);
    for (const id of ["RO-DEMO-001", "RO-DEMO-002", "RO-DEMO-003"]) {
        await expect(content).not.toContainText(id);
    }
    await expectNoHorizontalOverflow(page);
    await page.reload();
    await expect(content).toContainText(/chưa có|không có/i);
    await expectNoHorizontalOverflow(page);
});

test("a local multi-period order links to its illustrative schedule without inventing installment debt", async ({ page }) => {
    await signIn(page);
    await page.goto("/checkout?product=camera&months=3");
    const main = page.getByRole("main");
    await expect(main.getByLabel(/Chia theo tháng/)).toBeChecked();
    await main.getByRole("button", { name: "Xác nhận và thanh toán" }).click();
    await expect(page).toHaveURL(/\/orders\/RO-DEMO-[A-F\d-]+\?created=1/);
    const orderPath = new URL(page.url()).pathname;
    const id = orderPath.split("/").at(-1)!;

    await page.goto("/account?tab=installments");
    const content = page.locator(".account-workspace-content");
    await expect(content).toContainText(id);
    await expect(content).toContainText("Máy ảnh cho người mới bắt đầu");
    await expect(content).toContainText(/3\s*(tháng|kỳ)/i);
    await expect(content).toContainText(/demo|mô phỏng|minh họa/i);
    await expect(content).toContainText(/cục bộ|trên (thiết bị|trình duyệt)|lưu (tại|trên)/i);
    await expect(content).toContainText(/không[^.]*((thanh toán|giao dịch|trừ tiền|tiền)[^.]*thật|(thực hiện|phát sinh)[^.]*thanh toán)/i);
    await expect(content.getByText(/^(đã thanh toán|chưa thanh toán|quá hạn|nợ quá hạn|dư nợ|còn nợ)$/i)).toHaveCount(0);
    await expect(content.getByRole("button", { name: /thanh toán|trả tiền|trả ngay/i })).toHaveCount(0);
    const orderLink = content.locator(`a[href="${orderPath}"]`);
    await expect(orderLink).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.reload();
    await expect(content).toContainText(id);
    await orderLink.click();
    await expect(page).toHaveURL(new RegExp(`/orders/${id}$`));
    await expect(main.getByRole("heading", { name: `Đơn hàng ${id}` })).toBeVisible();
    const schedule = main.locator(".payment-schedule");
    await expect(schedule).toContainText("Lịch thanh toán · 3 kỳ");
    await expect(schedule.locator("ol li")).toHaveCount(3);
    const amounts = await schedule.locator("ol li strong").allTextContents();
    expect(amounts.map((amount) => Number(amount.replace(/\D/g, ""))).reduce((a, b) => a + b, 0)).toBe(1830000);
    await expectNoHorizontalOverflow(page);
});
