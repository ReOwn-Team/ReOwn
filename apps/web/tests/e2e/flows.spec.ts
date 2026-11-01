import { completeOtp } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "./fixtures";

async function login(page: Page) {
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
  await expect(dialog).toHaveCount(0);
}

test("browse keeps filters in URL, removes them individually and recovers", async ({
  page,
}, info) => {
  await page.goto("/browse?q=laptop");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Bộ lọc", exact: true }).click();
  await page.getByRole("radio", { name: "Dưới 100.000₫", exact: true }).click();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Xem 0 sản phẩm" }).click();
  await expect(page).toHaveURL(/budget=100000/);
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy sản phẩm phù hợp" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bỏ lọc ngân sách", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2 sản phẩm", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "2 sản phẩm", exact: true }),
  ).toBeVisible();
});

test("removing a saved card keeps keyboard focus on a remaining product", async ({
  page,
}) => {
  await page.goto("/saved");
  await login(page);
  const cards = page.locator(".product-grid .product-card");
  await expect(cards).toHaveCount(3);
  const remove = cards.first().getByRole("button", { name: "Bỏ lưu sản phẩm" });
  await remove.focus();
  await remove.press("Enter");
  await expect(cards).toHaveCount(2);
  await expect(cards.first().locator(".product-copy a")).toBeFocused();
});

test("saving resumes after login and survives reload", async ({ page }) => {
  await page.goto("/products/camera");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Lưu sản phẩm", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Email hoặc số điện thoại")
    .fill("nguyenan@example.com");
  await dialog
    .getByLabel("Mật khẩu", { exact: true })
    .fill("reown-test-password-2026");
  await dialog.locator("button[type=submit]").click();
  await completeOtp(page);
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .locator(".product-purchase")
      .getByRole("button", { name: "Bỏ lưu sản phẩm", exact: true })
      .first(),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/saved");
  await expect(
    page.getByRole("link", {
      name: "Máy ảnh cho người mới bắt đầu",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", {
      name: "Máy ảnh cho người mới bắt đầu",
      exact: true,
    }),
  ).toBeVisible();
});

test("checkout resumes after login, payment failure retries and sale updates buyer", async ({
  page,
}) => {
  await page.goto("/checkout?product=camera&months=3");
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Xác nhận và thanh toán" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Email hoặc số điện thoại")
    .fill("nguyenan@example.com");
  await dialog
    .getByLabel("Mật khẩu", { exact: true })
    .fill("reown-test-password-2026");
  await dialog.locator("button[type=submit]").click();
  await completeOtp(page);
  await expect(page).toHaveURL(/\/orders\/RO-DEMO-[A-F\d-]+\?created=1/);
  const orderURL = page.url().split("?")[0];
  const id = orderURL.split("/").at(-1)!;
  await main.getByRole("button", { name: "Quay lại bước thanh toán" }).click();
  await page
    .getByRole("button", { name: "Mô phỏng thanh toán thất bại" })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Chưa thanh toán thành công",
  );
  await page
    .getByRole("button", { name: "Mô phỏng thanh toán thành công" })
    .click();
  await expect(
    main.getByText("Chờ xác nhận", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    main.getByText("Chờ xác nhận", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/sales");
  await page.getByRole("button", { name: id, exact: true }).click();
  await main.getByRole("button", { name: "Xác nhận đơn", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận đơn", exact: true })
    .click();
  await expect(
    main.getByRole("button", { name: "Đã bàn giao vận chuyển" }),
  ).toBeVisible();
  await main.getByRole("button", { name: "Đã bàn giao vận chuyển" }).click();
  await page.goto(orderURL);
  await main.getByRole("button", { name: "Xác nhận đã nhận hàng" }).click();
  await expect(
    main.getByRole("button", { name: "Đánh giá giao dịch" }),
  ).toBeVisible();
  await page.goto("/checkout?product=camera");
  await expect(
    main.getByRole("button", { name: "Xác nhận và thanh toán" }),
  ).toBeDisabled();
  await expect(
    main.getByText("Sản phẩm đã bán. Hãy chọn món khác.", { exact: true }),
  ).toBeVisible();
});

test("pending order is reused instead of duplicated", async ({ page }) => {
  await page.goto("/checkout?product=laptop");
  await login(page);
  await page.getByRole("button", { name: "Xác nhận và thanh toán" }).click();
  await expect(page).toHaveURL(/\/orders\/RO-DEMO-001$/);
  await page.goto("/orders");
  await expect(page.getByRole("article")).toHaveCount(3);
});

test("draft images, publishing, editing and hiding remain consistent after reload", async ({
  page,
  authApi,
}) => {
  await page.goto("/sell");
  await login(page);
  const main = page.getByRole("main");
  await main
    .getByRole("button", { name: "Gửi duyệt", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page
    .getByLabel("Tên sản phẩm", { exact: true })
    .fill("Bàn học gấp gọn");
  await page.getByLabel("Giá bán (đ)").fill("250000");
  await page
    .getByLabel("Mô tả chi tiết")
    .fill("Bàn học gấp gọn đã dùng một kỳ, chắc chắn, phù hợp phòng trọ nhỏ.");
  await page
    .getByLabel("Ảnh sản phẩm", { exact: true })
    .setInputFiles("public/figma/chair.png");
  await expect(
    page.getByAltText("Ảnh sản phẩm 1", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Ảnh sản phẩm", { exact: true })
    .setInputFiles("public/figma/laptop.png");
  await page
    .getByRole("button", { name: "Đặt làm ảnh bìa", exact: true })
    .click();
  await page.getByRole("button", { name: "Lưu bản nháp" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu bản nháp");
  await page.reload();
  await expect(page.getByLabel("Tên sản phẩm", { exact: true })).toHaveValue(
    "Bàn học gấp gọn",
  );
  await page
    .getByLabel("Tôi xác nhận thông tin phản ánh đúng tình trạng sản phẩm.")
    .check();
  await main
    .getByRole("button", { name: "Gửi duyệt", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Quản lý tin đăng" })
    .click();
  const card = page.getByRole("article").filter({ hasText: "Bàn học gấp gọn" });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Chỉnh sửa" }).click();
  await page.getByLabel("Giá bán (đ)").fill("230000");
  await page.getByRole("button", { name: "Lưu bản nháp" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu bản nháp");
  await page.reload();
  await expect(page.getByLabel("Giá bán (đ)")).toHaveValue("230000");
  await page
    .getByLabel("Tôi xác nhận thông tin phản ánh đúng tình trạng sản phẩm.")
    .check();
  await main
    .getByRole("button", { name: "Lưu thay đổi tin đăng", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Quản lý tin đăng" })
    .click();
  await expect(card).toContainText("230.000₫");
  await expect(card).toContainText("Chờ duyệt");
  await expect(
    card.getByRole("button", { name: "Hiện lại", exact: true }),
  ).toHaveCount(0);
  authApi.approveProduct("Bàn học gấp gọn");
  await page.reload();
  await card.getByRole("button", { name: /^Thêm thao tác:/ }).click();
  await page.getByRole("menuitem", { name: "Ẩn tin", exact: true }).click();
  await page.goto("/browse?q=Bàn học gấp gọn");
  await expect(
    page.getByRole("heading", { name: "0 sản phẩm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Tài khoản Nguyễn An", exact: true }),
  ).toBeVisible();
  await page.goto("/listings");
  await card.getByRole("button", { name: /^Thêm thao tác:/ }).click();
  await page.getByRole("menuitem", { name: "Hiện lại", exact: true }).click();
  await card
    .getByRole("link", { name: "Bàn học gấp gọn", exact: true })
    .click();
  await expect(
    main.getByRole("heading", { level: 1, name: "Bàn học gấp gọn" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    main.getByRole("heading", { level: 1, name: "Bàn học gấp gọn" }),
  ).toBeVisible();
});

test("completed orders accept exactly one review", async ({ page }) => {
  await page.goto("/orders");
  await login(page);
  await page
    .getByRole("button", { name: "Đánh giá giao dịch", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Gửi đánh giá" }),
  ).toBeDisabled();
  await dialog.getByRole("radio", { name: "5 sao", exact: true }).check();
  await dialog
    .getByLabel("Nhận xét của bạn")
    .fill("Đúng mô tả, giao nhận thuận tiện.");
  await dialog.getByRole("button", { name: "Gửi đánh giá" }).click();
  await expect(
    page.getByRole("button", { name: "Đã đánh giá", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Đã đánh giá", exact: true }),
  ).toBeDisabled();
});

test("account navigation, recipient validation and reset work", async ({
  page,
}) => {
  await page.goto("/account");
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Tài khoản của tôi", level: 1 }),
  ).toBeVisible();
  const mobileMenu = page.locator(".account-mobile-menu > summary");
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page
    .getByRole("navigation", { name: "Quản lý tài khoản" })
    .getByRole("link", { name: "Địa chỉ nhận hàng" })
    .click();
  await page.getByRole("button", { name: "Thêm địa chỉ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Lưu người nhận" }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(3);
  await dialog.getByLabel("Họ và tên người nhận").fill("Nguyễn An");
  await dialog.getByLabel("Số điện thoại", { exact: true }).fill("0901234567");
  await dialog
    .getByLabel("Địa chỉ chi tiết")
    .fill("123 Nguyễn Văn Bảo, TP. Hồ Chí Minh");
  await dialog.getByRole("button", { name: "Lưu người nhận" }).click();
  await page.goto("/account");
  await page.reload();
  await page.getByRole("button", { name: "Đặt lại demo", exact: true }).click();
  await page
    .getByRole("button", { name: "Đặt lại dữ liệu", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("link", { name: "Tài khoản Nguyễn An", exact: true }),
  ).toBeVisible();
});

test("pages and dialogs have no axe violations", async ({ page }) => {
  test.setTimeout(60000);
  const violations: Array<{ path: string; issues: string[] }> = [];
  await page.goto("/");
  await login(page);
  for (const path of [
    "/",
    "/browse",
    "/products/laptop",
    "/sell",
    "/saved",
    "/checkout?product=camera",
    "/orders",
    "/orders/RO-DEMO-001",
    "/listings",
    "/sales",
    "/account",
    "/sellers/Minh%20Anh",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("main").locator("[aria-busy=true]"),
    ).toHaveCount(0);
    const result = await new AxeBuilder({ page }).analyze();
    if (result.violations.length)
      violations.push({
        path,
        issues: result.violations.flatMap((issue) =>
          issue.nodes.map((node) => `${issue.id}: ${node.html}`),
        ),
      });
  }
  await page.goto("/account?tab=kyc");
  await expect(page.getByRole("dialog")).toBeVisible();
  const modalResult = await new AxeBuilder({ page }).analyze();
  if (modalResult.violations.length)
    violations.push({
      path: "verification dialog",
      issues: modalResult.violations.flatMap((issue) =>
        issue.nodes.map((node) => `${issue.id}: ${node.html}`),
      ),
    });
  expect(violations).toEqual([]);
});

test("installment schedules preserve VND totals for every supported term", async ({
  page,
}) => {
  await page.goto("/products/laptop");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("radio", { name: /Chia theo tháng/ }),
  ).toHaveCount(0);
  await main.getByRole("button", { name: "Đặt hàng", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\?product=laptop$/);
  await main.getByRole("radio", { name: /Gặp trực tiếp/ }).check();
  await main.getByLabel(/Chia theo tháng/).check();
  const schedule = main.locator(".payment-schedule");
  for (const months of [3, 6, 9, 12]) {
    await main
      .getByRole("button", { name: `${months} tháng`, exact: true })
      .click();
    const amounts = await schedule.locator("ol li strong").allTextContents();
    expect(amounts).toHaveLength(months);
    const values = amounts.map((text) => Number(text.replace(/\D/g, "")));
    expect(values.reduce((sum, value) => sum + value, 0)).toBe(1000000);
    expect(values.every(Number.isSafeInteger)).toBe(true);
  }
});
