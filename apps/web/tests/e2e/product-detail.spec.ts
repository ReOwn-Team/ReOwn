import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";
import type { ApiProduct } from "@/lib/products/client";

const product: ApiProduct = {
  id: "da6887b3-470d-447a-ac2b-12ba9b688675",
  title: "Laptop có ảnh thật để kiểm tra",
  price: 1250000,
  category: "Laptop",
  condition: "Dùng tốt",
  description: "Máy dùng học tập.\nCó kèm sạc, có thể kiểm tra khi nhận.",
  knownDefects: "Góc vỏ có vết xước. Pin dùng khoảng hai giờ.",
  location: "TP. Hồ Chí Minh",
  fulfillmentMethods: ["meetup", "shipping"],
  status: "published",
  reviewStatus: "approved",
  revision: 1,
  rejectionReason: null,
  seller: {
    id: "031c2768-ac31-4000-8000-000000000001",
    displayName: "Minh Anh",
  },
  publishedAt: "2026-11-01T05:00:00Z",
  updatedAt: "2026-11-01T05:00:00Z",
  images: [
    {
      id: "031c2768-ac31-4000-8000-000000000002",
      url: "/figma/laptop.png",
      mimeType: "image/png",
      sizeBytes: 1000,
    },
    {
      id: "031c2768-ac31-4000-8000-000000000003",
      url: "/figma/chair.png",
      mimeType: "image/png",
      sizeBytes: 1000,
    },
  ],
};

test("real listing gallery supports thumbnails, zoom keyboard controls and focus return without demo claims", async ({
  page,
}, info) => {
  await page.route(`**/api/products/${product.id}`, (route) =>
    route.fulfill({ json: product }),
  );
  await page.goto(`/products/${product.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: product.title }),
  ).toBeVisible();
  const main = page.getByRole("main");
  const gallery = main.getByRole("region", {
    name: "Bộ ảnh sản phẩm",
    exact: true,
  });
  await expect(gallery.locator(".product-gallery img")).toHaveAttribute(
    "src",
    "/figma/laptop.png",
  );
  await gallery.getByRole("button", { name: "Xem ảnh 2", exact: true }).click();
  await expect(gallery.locator(".product-gallery img")).toHaveAttribute(
    "src",
    "/figma/chair.png",
  );
  const opener = gallery.getByRole("button", {
    name: "Phóng to ảnh sản phẩm",
    exact: true,
  });
  await opener.click();
  const zoom = page.getByRole("dialog", { name: "Ảnh sản phẩm", exact: true });
  await expect(zoom).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(zoom.locator(".zoom-image")).toHaveAttribute(
    "src",
    "/figma/laptop.png",
  );
  await page.keyboard.press("ArrowRight");
  await expect(zoom.locator(".zoom-image")).toHaveAttribute(
    "src",
    "/figma/chair.png",
  );
  await page.screenshot({
    path: info.outputPath("product-gallery-zoom.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(zoom).toHaveCount(0);
  await expect(opener).toBeFocused();
  await gallery
    .getByRole("button", { name: "Ảnh tiếp theo", exact: true })
    .click();
  await expect(
    gallery.getByRole("button", { name: "Xem ảnh 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(main.locator(".product-photo-caption")).toContainText(
    "Ảnh từ tin đăng",
  );
  await expect(
    main.getByText(
      /Ảnh minh họa|Hồ sơ minh họa|Đã xác thực danh tính|12 giao dịch/,
    ),
  ).toHaveCount(0);
  await expect(
    main.getByRole("button", { name: "Đặt hàng", exact: true }),
  ).toBeDisabled();
  await expect(main.locator(".product-condition-note")).toContainText(
    product.knownDefects,
  );
  await main.getByRole("link", { name: "Xem tình trạng" }).click();
  await expect(main.locator("#tinh-trang")).toBeFocused();
  const results = await new AxeBuilder({ page }).include("main").analyze();
  expect(results.violations).toEqual([]);
});

test("product overview gives ordering priority and keeps the term preview independent", async ({
  page,
}, info) => {
  await page.goto("/products/laptop");
  const main = page.getByRole("main");
  const order = main.getByRole("button", { name: "Đặt hàng", exact: true });
  const purchase = main.locator(".product-purchase");
  await expect(purchase.locator(".detail-price")).toHaveCount(1);
  await expect(purchase.locator(".detail-price")).toHaveText("1.000.000₫");
  await expect(
    purchase.getByRole("radio", { name: "Trả toàn bộ", exact: true }),
  ).toBeChecked();
  await expect(
    purchase.getByRole("heading", { name: "Cách nhận sản phẩm", exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "Cách nhận sản phẩm", exact: true }),
  ).toHaveCount(1);
  await expect(main.getByRole("navigation", { name: "Nội dung tin đăng" })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Nhận xét về người bán" })).toHaveCount(0);
  await expect(main.locator(".product-overview > .product-seller")).toHaveCount(1);
  const purchaseBox = (await purchase.boundingBox())!;
  const informationBox = (await main.locator(".product-overview > .product-information").boundingBox())!;
  if (info.project.name === "desktop") {
    expect(Math.abs(informationBox.x - purchaseBox.x)).toBeLessThan(1);
    expect(Math.abs(informationBox.width - purchaseBox.width)).toBeLessThan(1);
  }
  await expect(main.locator(".product-seller-chat")).toBeDisabled();
  await expect(main.locator(".product-information .product-seller")).toHaveCount(0);

  const actions = (await main.locator(".product-actions").boundingBox())!;
  expect((await order.boundingBox())!.width / actions.width).toBeGreaterThan(
    0.7,
  );
  await expect(
    main.getByRole("button", { name: "Ảnh tiếp theo", exact: true }),
  ).toHaveCount(0);
  await main.locator("img").evaluateAll((images) =>
    images.forEach((image) => {
      (image as HTMLImageElement).loading = "eager";
    }),
  );
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      main
        .locator(".product-gallery img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: info.outputPath("product-detail.png"),
    fullPage: true,
    animations: "disabled",
  });
  const payment = main.getByRole("region", { name: "Giá và cách thanh toán" });
  await payment.getByRole("radio", { name: "Trả góp" }).check();
  await payment.getByRole("radio", { name: "12 tháng", exact: true }).check();
  await expect(payment.locator(".price-preview-monthly strong")).toHaveText("83.333₫");
  await expect(payment.locator(".price-preview-summary")).toContainText("Lần thanh toán cuối");
  await expect(payment.locator(".price-preview-schedule tbody")).not.toBeVisible();
  await payment.getByText("Xem lịch thanh toán").click();
  await expect(payment.locator(".price-preview-schedule tbody tr")).toHaveCount(12);
  await expect(purchase.locator(".detail-price")).toHaveText("1.000.000₫");
  await expect(purchase.locator(".detail-price")).toHaveCount(1);
  await order.click();
  await expect(page).toHaveURL(/\/checkout\?product=laptop&months=12$/);
  await expect(page.getByRole("radio", { name: /Chia theo tháng/ })).toBeChecked();
});

test("receiving information is shown once and only for supported fulfillment methods", async ({
  page,
}) => {
  await page.route(`**/api/products/${product.id}`, (route) =>
    route.fulfill({ json: { ...product, fulfillmentMethods: ["meetup"] } }),
  );
  await page.goto(`/products/${product.id}`);
  const purchase = page.locator(".product-purchase");
  const delivery = purchase.getByRole("region", {
    name: "Cách nhận sản phẩm",
    exact: true,
  });
  await expect(
    delivery.getByRole("heading", { name: "Gặp trực tiếp", exact: true }),
  ).toBeVisible();
  await expect(
    delivery.getByRole("heading", { name: "Giao hàng", exact: true }),
  ).toHaveCount(0);
  await expect(delivery).toContainText(product.location);
  await expect(page.locator("#giao-nhan")).toHaveCount(1);
});

test("gallery and seller stay visible while scrolling the product details", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/products/laptop");
  await page.getByRole("radio", { name: "Trả góp" }).check();
  await page.getByRole("radio", { name: "12 tháng", exact: true }).check();
  await page.getByText("Xem lịch thanh toán").click();
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(async () => (await page.locator(".product-overview > .product-media").boundingBox())?.y).toBeCloseTo(20, 0);
  await expect.poll(async () => (await page.locator(".product-overview > .product-seller").boundingBox())?.y).toBeCloseTo(20, 0);
});
