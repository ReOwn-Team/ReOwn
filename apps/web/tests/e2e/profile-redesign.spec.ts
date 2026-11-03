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
    await dialog.locator('button[type="submit"]').click();
    await completeOtp(page);
    await expect(page.locator(".profile-panel")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    document.documentElement.scrollWidth -
                    document.documentElement.clientWidth,
            ),
        )
        .toBeLessThanOrEqual(1);
}

test("profile fields, editing and verification work on desktop and mobile", async ({
    page,
}, testInfo) => {
    await signIn(page);
    const panel = page.locator(".profile-panel");
    const name = panel.getByLabel("Tên hiển thị", { exact: true });
    const email = panel.getByLabel("Email", { exact: true });
    const phone = panel.getByLabel("Số điện thoại đăng nhập", { exact: true });
    await expect(name).toHaveValue(testUser.displayName);
    await expect(name).toBeEditable();
    await expect(email).toHaveValue(testUser.email!);
    await expect(email).toHaveAttribute("readonly", "");
    await expect(email).not.toBeEditable();
    await expect(phone).toHaveValue(testUser.phone!);
    await expect(phone).toHaveAttribute("readonly", "");
    await expect(phone).not.toBeEditable();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
        path: testInfo.outputPath(`profile-${testInfo.project.name}.png`),
        fullPage: true,
        animations: "disabled",
    });

    const updatedName = "Nguyễn An Mới";
    await name.fill(`  ${updatedName}  `);
    const patch = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/v1/users/me" &&
            response.request().method() === "PATCH",
    );
    await panel.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    const response = await patch;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toEqual({ displayName: updatedName });
    await expect(name).toHaveValue(updatedName);
    await expect(email).toHaveValue(testUser.email!);
    await expect(phone).toHaveValue(testUser.phone!);

    const verification = panel
        .locator(".profile-overview > div")
        .filter({ has: page.getByText("Xác thực danh tính", { exact: true }) });
    await expect(verification).toHaveCount(1);
    await verification
        .getByRole("button", { name: "Xác thực bằng thẻ sinh viên", exact: true })
        .click();
    const dialog = page.getByRole("dialog", { name: "Xác thực sinh viên" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Xác thực sinh viên" })).toBeVisible();
    await expect(dialog.getByLabel(/Tôi đồng ý/)).not.toBeChecked();
    await expect(dialog.getByRole("button", { name: "Tiếp tục", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
});

test("profile at 320px has no horizontal overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Narrow coverage runs in the mobile project.");
    await page.setViewportSize({ width: 320, height: 844 });
    await signIn(page);
    const panel = page.locator(".profile-panel");
    await expect(panel.getByLabel("Tên hiển thị", { exact: true })).toBeVisible();
    await expect(panel.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(panel.getByLabel("Số điện thoại đăng nhập", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Lưu thay đổi", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
        path: testInfo.outputPath("profile-mobile-320.png"),
        fullPage: true,
        animations: "disabled",
    });
});
