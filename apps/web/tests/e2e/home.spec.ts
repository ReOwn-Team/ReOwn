import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
    await page.goto("/");
});

test("homepage has its main heading and no horizontal overflow", async ({
    page,
}, testInfo) => {
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    await expect(
        main.getByRole("heading", {
            level: 1,
            name: /Đồ bạn cần\.\s*Giá bạn thích\./,
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

test("new listings stay in one row and navigation reaches more products", async ({
    page,
}) => {
    const section = page.getByRole("region", { name: "Mới đăng" });
    const track = section.locator(".home-new-track");
    const cards = track.locator(".product-card");
    await expect(cards.first()).toBeVisible();
    await expect(section.getByText(/món đồ đang chờ chủ mới/)).toHaveCount(0);
    const positions = await cards.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().top),
    );
    expect(new Set(positions).size).toBe(1);
    await section
        .getByRole("button", { name: "Sản phẩm mới tiếp theo" })
        .click();
    await expect
        .poll(() => track.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
    await section
        .getByRole("button", { name: "Sản phẩm mới trước đó" })
        .click();
    await expect
        .poll(() => track.evaluate((element) => element.scrollLeft))
        .toBe(0);
});

test("category chips filter the new listings grid", async ({ page }) => {
    const main = page.getByRole("main");
    const section = main.getByRole("region", { name: /Mới đăng/ });
    await section.getByRole("radio", { name: "Sách", exact: true }).click();
    await expect(
        section.getByRole("link", {
            name: "Bộ sách cho kỳ học mới",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        section.getByRole("link", {
            name: "Laptop học tập 14 inch",
            exact: true,
        }),
    ).toHaveCount(0);
});

test("budget form validates and navigates to browse", async ({ page }) => {
    const main = page.getByRole("main");
    await main.getByLabel("Ngân sách tối đa (đ)").fill("");
    await main.getByRole("button", { name: "Tìm đồ phù hợp" }).click();
    await expect(main.getByRole("alert")).toContainText("ngân sách");

    await main.getByLabel("Ngân sách tối đa (đ)").fill("350000");
    await main.getByRole("button", { name: "Tìm đồ phù hợp" }).click();
    await expect(page).toHaveURL(/\/browse\?budget=350000/);
    await expect(
        main.getByRole("button", { name: "Bỏ lọc ngân sách", exact: true }),
    ).toContainText("Tối đa 350.000₫");
    await expect(
        page.getByRole("heading", {
            level: 1,
            name: "Tìm món đồ hợp với bạn.",
        }),
    ).toBeVisible();
});
