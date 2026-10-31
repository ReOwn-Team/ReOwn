import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("homepage has its main heading and no horizontal overflow", async ({
  page,
}, testInfo) => {
  const main = page.getByRole("main");
  await expect(main).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    main.getByRole("heading", {
      level: 1,
      name: "Đồ cũ, khởi đầu mới.",
      exact: true,
    }),
  ).toBeVisible();

  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);

  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("the first keyboard stop skips to the main content", async ({ page }) => {
  const main = page.getByRole("main");
  await expect(main).toHaveAttribute("id", /\S+/);
  const mainId = await main.getAttribute("id");

  await page.keyboard.press("Tab");
  const skipLink = page.locator("a:focus");
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toHaveAccessibleName(/\S+/);
  await expect(skipLink).toHaveAttribute("href", `#${mainId}`);

  await page.keyboard.press("Enter");
  await expect(main).toBeFocused();
});

test("homepage has no axe violations, including heading rules", async ({
  page,
}) => {
  await expect(page.getByRole("main")).toBeVisible();
  const results = await new AxeBuilder({ page })
    .options({
      rules: {
        "heading-order": { enabled: true },
        "page-has-heading-one": { enabled: true },
      },
    })
    .analyze();

  expect(results.violations).toEqual([]);
});
