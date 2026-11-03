import { completeOtp, expect, test, testPassword, testUser } from "./fixtures";

test("listing editor keeps draft, photo preview and privacy details", async ({ page }, info) => {
    await page.goto("/sell");
    await page.getByRole("main").getByRole("button", { name: "Đăng nhập", exact: true }).click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog.getByLabel("Email hoặc số điện thoại").fill(testUser.email!);
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator('button[type="submit"]').click();
    await completeOtp(page);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Đăng bán sản phẩm" })).toBeVisible();
    await expect(main.getByText(/nhà cung cấp có thể lưu hoặc dùng/i)).toBeVisible();
    await page.screenshot({ path: info.outputPath("sell.png"), fullPage: true, animations: "disabled" });
    await main.getByLabel("Tên sản phẩm", { exact: true }).fill("Bàn học gấp gọn");
    await main.getByLabel("Giá bán (đ)").fill("250000");
    await main.getByLabel("Ảnh sản phẩm", { exact: true }).setInputFiles("public/figma/chair.png");
    await expect(main.getByAltText("Ảnh sản phẩm 1")).toBeVisible();
    await expect(main.locator(".sell-preview")).toContainText("Bàn học gấp gọn");
    await expect(main.locator(".sell-preview")).toContainText("250.000₫");
    await main.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByRole("status")).toContainText("Đã lưu bản nháp");
    await page.reload();
    await expect(main.getByLabel("Tên sản phẩm", { exact: true })).toHaveValue("Bàn học gấp gọn");
    await expect(main.getByAltText("Ảnh sản phẩm 1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
