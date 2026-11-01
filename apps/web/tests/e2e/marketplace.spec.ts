import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

test("product cards keep imagery clear and use a stable red price", async ({
  page,
}) => {
  await page.goto("/");
  const latest = page.getByRole("region", { name: "Mới đăng", exact: true });
  const card = latest
    .locator("article")
    .filter({
      has: page.getByRole("link", {
        name: "Bộ sách cho kỳ học mới",
        exact: true,
      }),
    });
  await expect(card.locator(".product-condition")).toHaveText("Có ghi chú");
  await expect(card.locator(".product-price")).toHaveText("180.000₫");
  await expect(card.locator(".product-card-seller")).toContainText("Thu Hà");
  await expect(card.locator(".product-card-rating")).toHaveText("5,0 (6)");
  await expect(card.locator("time")).toHaveText("38 phút trước");
  await expect(card.locator(".product-photo button")).toHaveCount(0);
  const price = card.locator(".product-price");
  await expect(price).toHaveCSS("color", "rgb(255, 59, 48)");
  const title = card.getByRole("link", {
    name: "Bộ sách cho kỳ học mới",
    exact: true,
  });
  const initialColor = await title.evaluate((element) => getComputedStyle(element).color);
  await title.hover();
  await expect(title).toHaveCSS("color", initialColor);
  await title.click();
  await expect(page).toHaveURL(/\/products\/books$/);
});

test("home content stays accessible and budget shelf uses actual product prices", async ({
  page,
}) => {
  await page.goto("/");
  const shelf = page.getByRole("region", {
    name: "Dưới 500k, dễ chọn",
    exact: true,
  });
  await expect(shelf.locator("article").first()).toBeVisible();
  const prices = await shelf.locator(".product-price").allTextContents();
  expect(prices.length).toBeGreaterThan(0);
  expect(
    prices.every((price) => Number(price.replace(/\D/g, "")) <= 500000),
  ).toBe(true);
  const results = await new AxeBuilder({ page }).include("main").analyze();
  expect(results.violations).toEqual([]);
});

test("320px browsing retains two square-image cards per row", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  const latest = page.getByRole("region", { name: "Mới đăng", exact: true });
  const cards = latest.locator("article");
  await expect(cards.first()).toBeVisible();
  const first = (await cards.nth(0).boundingBox())!;
  const second = (await cards.nth(1).boundingBox())!;
  expect(Math.abs(first.y - second.y)).toBeLessThan(1);
  expect(second.x).toBeGreaterThan(first.x + first.width);
  const photo = (await cards.first().locator(".product-photo").boundingBox())!;
  expect(Math.abs(photo.width - photo.height)).toBeLessThan(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath("home-marketplace-320.png"),
    fullPage: true,
    animations: "disabled",
  });
});
