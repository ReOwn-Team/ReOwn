import { test, expect, testPassword } from "./fixtures";

test("login requires email OTP and rejects a wrong code before creating a session", async ({
    page,
    context,
}) => {
    await page.goto("/account");
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog
        .getByLabel("Email hoặc số điện thoại")
        .fill("nguyenan@example.com");
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator('button[type="submit"]').click();
    await dialog.getByRole("button", { name: "Tôi là con người" }).click();
    await expect(
        dialog.getByLabel("Mã xác nhận", { exact: true }),
    ).toBeFocused();
    await expect(
        page.getByRole("link", { name: "Tài khoản Nguyễn An", exact: true }),
    ).toHaveCount(0);
    expect(
        (await context.cookies()).some(
            (cookie) => cookie.name === "reown_web_session",
        ),
    ).toBe(false);
    await dialog.getByLabel("Mã xác nhận", { exact: true }).fill("000000");
    await expect(dialog.getByRole("alert")).toContainText("Mã không đúng");
    await dialog.getByLabel("Mã xác nhận", { exact: true }).fill("123456");
    await expect(dialog).toHaveCount(0);
    await expect(
        page.getByRole("link", { name: "Tài khoản Nguyễn An", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Tên hiển thị")).toHaveValue("Nguyễn An");
});

test("OTP resend replaces the code and returning to credentials does not authenticate", async ({
    page,
    authApi,
}) => {
    authApi.otpResendAfter = 0;
    await page.goto("/account");
    await page
        .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
        .click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog
        .getByLabel("Email hoặc số điện thoại")
        .fill("nguyenan@example.com");
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator('button[type="submit"]').click();
    await dialog.getByRole("button", { name: "Tôi là con người" }).click();
    await dialog
        .getByRole("button", { name: "Gửi lại mã", exact: true })
        .click();
    await dialog.getByLabel("Mã xác nhận", { exact: true }).fill("123456");
    await expect(dialog.getByRole("alert")).toContainText("Mã không đúng");
    await dialog.getByRole("button", { name: "Quay lại", exact: true }).click();
    await expect(dialog.getByLabel("Mật khẩu", { exact: true })).toHaveValue(
        "",
    );
    await expect(
        page.getByRole("link", { name: "Tài khoản Nguyễn An", exact: true }),
    ).toHaveCount(0);
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator('button[type="submit"]').click();
    await dialog.getByRole("button", { name: "Tôi là con người" }).click();
    await dialog
        .getByRole("button", { name: "Gửi lại mã", exact: true })
        .click();
    await dialog.getByLabel("Mã xác nhận", { exact: true }).fill("654321");
    await expect(dialog).toHaveCount(0);
});
