import { test, expect, completeOtp, testPassword } from "./fixtures";

test("captcha appears on valid submit and gates OTP", async ({
  page,
  authApi,
}) => {
  await page.goto("/account");
  await page
    .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
    .click();
  const dialog = page.locator("dialog.auth-dialog");
  await expect(
    dialog.getByText("Xác minh bảo mật", { exact: true }),
  ).toHaveCount(0);
  await dialog.locator("button[type=submit]").click();
  await expect(
    dialog.getByText("Xác minh bảo mật", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByLabel("Email hoặc số điện thoại")
    .fill("nguyenan@example.com");
  await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
  await dialog.locator("button[type=submit]").click();
  const captcha = page.getByRole("dialog", {
    name: "Xác minh bảo mật",
    exact: true,
  });
  await expect(captcha).toBeVisible();
  await expect(
    captcha.getByRole("button", { name: "Tôi là con người" }),
  ).toBeVisible();
  const bounds = await captcha.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(352);
  await expect(captcha.locator("h2, .text-link")).toHaveCount(0);
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width - 32);
  expect(authApi.requests.some((r) => r.path.endsWith("login"))).toBe(false);
  await captcha.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(dialog.getByLabel("Mật khẩu", { exact: true })).toBeEnabled();
  await dialog.locator("button[type=submit]").click();
  await completeOtp(page);
});

test("captcha script failures allow retry without sending credentials", async ({
  page,
  context,
  authApi,
}) => {
  await context.route("https://js.hcaptcha.com/1/api.js**", (route) =>
    route.abort(),
  );
  await page.goto("/account");
  await page
    .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
    .click();
  const dialog = page.locator("dialog.auth-dialog");
  await dialog
    .getByLabel("Email hoặc số điện thoại")
    .fill("nguyenan@example.com");
  await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
  await dialog.locator("button[type=submit]").click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Không tải được hCaptcha",
  );
  await expect(dialog.getByLabel("Mật khẩu", { exact: true })).toBeEnabled();
  expect(authApi.requests.some((r) => r.path.endsWith("login"))).toBe(false);
});

test("Escape closes only captcha and keeps the entered credentials", async ({
  page,
  authApi,
}) => {
  await page.goto("/account");
  await page
    .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
    .click();
  const auth = page.locator("dialog.auth-dialog");
  await auth
    .getByLabel("Email hoặc số điện thoại")
    .fill("nguyenan@example.com");
  await auth.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
  await auth.locator("button[type=submit]").click();
  const captcha = page.getByRole("dialog", {
    name: "Xác minh bảo mật",
    exact: true,
  });
  await expect(captcha).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(captcha).toHaveCount(0);
  await expect(auth).toBeVisible();
  await expect(auth.getByLabel("Mật khẩu", { exact: true })).toHaveValue(
    testPassword,
  );
  await expect(auth.locator("button[type=submit]")).toBeEnabled();
  expect(authApi.requests.some((r) => r.path.endsWith("login"))).toBe(false);
  await auth.locator("button[type=submit]").click();
  await completeOtp(page);
});
