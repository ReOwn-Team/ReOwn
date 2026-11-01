import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect, completeOtp, testPassword } from "./fixtures";

test("customer journeys keep their primary content reachable on every screen", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(`${page.url()}: ${error.message}`);
  });
  const directory = process.env.REOWN_UX_SCREENSHOTS;
  if (directory) mkdirSync(directory, { recursive: true });
  async function inspect(name: string, path: string) {
    await page.goto(path);
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    expect(errors, `Runtime errors on ${path}`).toEqual([]);
    expect(
      await page.evaluate(() => getComputedStyle(document.body).fontFamily),
    ).toContain("Be Vietnam Pro");
    if (directory)
      await page.screenshot({
        path: join(directory, `${testInfo.project.name}-${name}.png`),
        fullPage: true,
        animations: "disabled",
      });
  }
  await inspect("home", "/");
  await inspect("browse", "/browse");
  await inspect("product", "/products/laptop");
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
  await completeOtp(page);
  await expect(auth).toHaveCount(0);
  await inspect("account", "/account");
  await inspect("orders", "/orders");
  await inspect("sell", "/sell");
  expect(errors).toEqual([]);
});
