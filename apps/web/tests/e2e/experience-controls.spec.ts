import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("category navigation has no list markers", async ({ page }) => {
  await page.goto("/");
  expect(
    await page
      .locator(".home-categories ul")
      .evaluate((element) => getComputedStyle(element).listStyleType),
  ).toBe("none");
});

test("mobile bottom navigation stays on screen and the hamburger menu supports dismissal and navigation", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.goto("/");
  const bottom = page.getByRole("navigation", {
    name: "Điều hướng mobile",
    exact: true,
  });
  await expect(bottom).toBeVisible();
  for (const scroll of [0, 900, 2200]) {
    await page.evaluate((y) => window.scrollTo(0, y), scroll);
    const bounds = (await bottom.boundingBox())!;
    expect(
      Math.abs(bounds.y + bounds.height - (page.viewportSize()!.height - 12)),
    ).toBeLessThan(1);
    expect(bounds.height).toBeGreaterThanOrEqual(56);
    const links = await bottom.locator(".mobile-tab").all();
    expect(links).toHaveLength(3);
    let right = 0;
    for (const link of links) {
      const box = (await link.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(right);
      expect(box.width).toBeGreaterThanOrEqual(44);
      right = box.x + box.width;
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("mobile-header-and-bottom.png"),
    animations: "disabled",
  });
  const trigger = page.getByRole("button", { name: "Mở menu điều hướng" });
  await trigger.click();
  const menu = page.getByRole("dialog", {
    name: "Menu điều hướng",
    exact: true,
  });
  await expect(menu).toBeVisible();
  await expect
    .poll(async () => Math.abs((await menu.boundingBox())!.x))
    .toBeLessThan(1);
  expect((await menu.boundingBox())!.y).toBe(0);
  await expect(
    menu.getByRole("link", { name: "Đơn mua", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-menu.png"),
    animations: "disabled",
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu
    .getByRole("link", { name: "Tìm theo ngân sách", exact: true })
    .click();
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveURL(/\/browse\?budget=500000$/);
  await page.getByRole("button", { name: "Mở tìm kiếm", exact: true }).click();
  const search = page.getByRole("dialog", {
    name: "Tìm kiếm sản phẩm",
    exact: true,
  });
  const input = search.getByRole("searchbox");
  await expect(input).toBeFocused();
  await input.fill("tai nghe");
  await input.press("Enter");
  await expect(search).toHaveCount(0);
  await expect(page).toHaveURL(/q=tai%20nghe$/);
  await page.setViewportSize({ width: 320, height: 568 });
  await trigger.click();
  await menu
    .getByRole("link", { name: "Liên hệ hợp tác", exact: true })
    .scrollIntoViewIfNeeded();
  const close = menu.getByRole("button", { name: "Đóng", exact: true });
  const closeBounds = (await close.boundingBox())!;
  expect(closeBounds.y).toBeGreaterThanOrEqual(0);
  expect(closeBounds.y + closeBounds.height).toBeLessThanOrEqual(568);
  await close.click();
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("filter choices have usable touch targets and keyboard selection", async ({
  page,
}, info) => {
  await page.goto("/browse");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Bộ lọc", exact: true }).click();
  const control = page.getByRole("radio", {
    name: "Dưới 100.000₫",
    exact: true,
  });
  await expect(control).toBeVisible();
  await expect
    .poll(async () => (await control.boundingBox())!.height)
    .toBeGreaterThanOrEqual(44);
  await control.focus();
  await control.press("Space");
  await expect(control).toBeChecked();
  await expect(page).toHaveURL(/budget=100000/);
});

test("mobile purchase dock follows visibility and leaves payment choice to checkout", async ({
  page,
}, info) => {
  await page.goto("/products/laptop");
  const dock = page.getByRole("complementary", {
    name: "Tiếp tục mua sản phẩm",
  });
  if (info.project.name === "desktop") {
    await expect(dock).toBeHidden();
    return;
  }
  await expect(dock).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: /Chia theo tháng/ }),
  ).toHaveCount(0);
  const original = page.getByRole("button", { name: "Đặt hàng", exact: true });
  await original.evaluate((element) =>
    window.scrollTo(
      0,
      element.getBoundingClientRect().top + window.scrollY - 180,
    ),
  );
  await expect(dock).toHaveCount(0);
  await page.evaluate(() => window.scrollBy(0, window.innerHeight));
  await expect(dock).toBeVisible();
  await expect(dock).toContainText("Chọn thanh toán ở bước tiếp theo");
  await dock
    .getByRole("button", { name: "Tiếp tục đặt hàng", exact: true })
    .click();
  await expect(page).toHaveURL(/\/checkout\?product=laptop$/);
  await expect(page.getByRole("radio", { name: /Trả thẳng/ })).toBeChecked();
  await page.getByRole("radio", { name: /Chia theo tháng/ }).check();
  await page.getByRole("button", { name: "6 tháng", exact: true }).click();
  await expect(page.locator(".payment-schedule ol li")).toHaveCount(6);
});

test("product payment choice carries the selected term into checkout", async ({
  page,
}) => {
  await page.goto("/products/laptop");
  const preview = page.getByRole("region", {
    name: "Giá và cách thanh toán",
    exact: true,
  });
  await preview.getByRole("radio", { name: "Trả góp" }).check();
  await preview.getByRole("radio", { name: "12 tháng", exact: true }).check();
  await expect(preview.locator(".price-preview-monthly")).toContainText(
    "83.333₫",
  );
  await page.getByRole("button", { name: "Đặt hàng", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\?product=laptop&months=12$/);
  await expect(page.getByRole("radio", { name: /Chia theo tháng/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "12 tháng", exact: true })).toHaveAttribute("aria-pressed", "true");
});
