import { completeOtp } from "./fixtures";
import { expect, test } from "./fixtures";

test("all screens fit the responsive matrix and local assets render", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Email hoặc số điện thoại")
    .fill("nguyenan@example.com");
  await dialog
    .getByLabel("Mật khẩu", { exact: true })
    .fill("reown-test-password-2026");
  await dialog.locator("button[type=submit]").click();
  await completeOtp(page);
  const widths =
    info.project.name === "desktop" ? [768, 1024, 1440] : [320, 390];
  const routes = [
    "/",
    "/browse",
    "/products/laptop",
    "/checkout?product=camera",
    "/orders",
    "/orders/RO-DEMO-001",
    "/sell",
    "/listings",
    "/sales",
    "/account",
    "/saved",
    "/sellers/Minh%20Anh",
  ];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1 }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
        `${route} at ${width}px`,
      ).toBeLessThanOrEqual(0);
      // Full-page checks deliberately load images beyond the lazy-load threshold.
      await page.locator("main img").evaluateAll((images) =>
        images.forEach((image) => {
          (image as HTMLImageElement).loading = "eager";
        }),
      );
      await expect
        .poll(
          async () =>
            page
              .locator("main img")
              .evaluateAll((images) =>
                images
                  .filter(
                    (image) =>
                      !(image as HTMLImageElement).complete ||
                      !(image as HTMLImageElement).naturalWidth,
                  )
                  .map((image) => image.getAttribute("src")),
              ),
          { message: `assets on ${route} at ${width}px` },
        )
        .toEqual([]);
      if (width === 1440 || width === 390)
        await page.screenshot({
          path: info.outputPath(
            `${width}-${route.replace(/[^a-z\d]/gi, "-")}.png`,
          ),
          fullPage: true,
          animations: "disabled",
        });
    }
  }
});

test("auth dialog supports keyboard, shows passwords and returns focus", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Đăng nhập / Đăng ký",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Mật khẩu", { exact: true })
    .fill("reown-test-password-2026");
  await dialog.getByRole("button", { name: "Hiện mật khẩu" }).click();
  await expect(dialog.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await dialog.locator("button[type=submit]").click();
  await expect(dialog.getByRole("alert")).toContainText("hợp lệ");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("registration fits short screens and keeps close reachable while scrolling", async ({
  page,
}, info) => {
  const sizes =
    info.project.name === "desktop"
      ? [
          [1080, 650],
          [768, 600],
          [844, 390],
        ]
      : [
          [390, 660],
          [320, 568],
        ];
  await page.goto("/");
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const trigger = page.getByRole("button", {
      name: "Đăng nhập / Đăng ký",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Đăng ký", exact: true }).click();
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(15);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height - 15);
    expect(bounds!.width).toBeLessThanOrEqual(width - 32);
    const tabs = dialog.locator(".auth-tabs");
    const tabBounds = await tabs.boundingBox();
    expect(tabBounds!.y).toBeGreaterThanOrEqual(bounds!.y);
    // Both labels stay on one line, including at 320px.
    expect(tabBounds!.height).toBeLessThan(60);
    await dialog.getByLabel("Họ và tên").focus();
    await dialog.locator("button[type=submit]").click();
    await expect(
      dialog.getByText("Nhập tên từ 1 đến 100 ký tự."),
    ).toBeVisible();
    const content = dialog.locator(".auth-layout");
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(
      await content.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
    const close = dialog.getByRole("button", { name: "Đóng", exact: true });
    const closeBounds = await close.boundingBox();
    expect(closeBounds!.y).toBeGreaterThanOrEqual(bounds!.y);
    expect(closeBounds!.y + closeBounds!.height).toBeLessThan(height - 15);
    await close.click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});
