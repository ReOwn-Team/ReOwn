import { test, expect, completeOtp, testPassword } from "./fixtures";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
async function openForm(page: import("./fixtures").Page) {
  await page.goto("/sell");
  await page
    .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
    .click();
  const dialog = page.locator("dialog.auth-dialog");
  await dialog
    .getByLabel("Email hoặc số điện thoại")
    .fill("nguyenan@example.com");
  await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
  await dialog.locator("button[type=submit]").click();
  await completeOtp(page);
  await page
    .getByLabel("Tên sản phẩm", { exact: true })
    .fill("Laptop kiểm tra ảnh gốc");
  await page
    .getByLabel("Mô tả chi tiết")
    .fill("Laptop dùng cho việc học tập, có ảnh chụp bên ngoài để đối chiếu.");
  await page.getByLabel("Giá bán (đ)", { exact: true }).fill("500000");
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận thông tin phản ánh đúng tình trạng sản phẩm.",
    })
    .check();
}
test("HEIC preview preserves original bytes across draft reload and submission stays pending", async ({
  page,
  authApi,
}) => {
  await openForm(page);
  const file = readFileSync("../api/tests/fixtures/iphone7.heic");
  await page.getByLabel("Ảnh sản phẩm", { exact: true }).setInputFiles({
    name: "original.heic",
    mimeType: "image/heic",
    buffer: file,
  });
  await expect(
    page.getByAltText("Ảnh sản phẩm 1", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
  await page.reload();
  await expect(
    page.getByAltText("Ảnh sản phẩm 1", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận thông tin phản ánh đúng tình trạng sản phẩm.",
    })
    .check();
  await page.getByRole("button", { name: "Gửi duyệt", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tin đang chờ xét duyệt.", exact: true }),
  ).toBeVisible();
  expect(authApi.uploadedPhotoHashes).toEqual([
    createHash("sha256").update(file).digest("hex"),
  ]);
  await page
    .getByRole("button", { name: "Quản lý tin đăng", exact: true })
    .click();
  const card = page
    .getByRole("article")
    .filter({ hasText: "Laptop kiểm tra ảnh gốc" });
  await expect(card).toContainText("Chờ duyệt");
  await expect(
    card.getByRole("button", { name: "Hiện lại", exact: true }),
  ).toHaveCount(0);
  await page.goto("/browse?q=Laptop kiểm tra ảnh gốc");
  await expect(
    page.getByRole("heading", { name: "0 sản phẩm", exact: true }),
  ).toBeVisible();
});
test("metadata rejection identifies the photo and preserves the draft", async ({
  page,
  authApi,
}) => {
  authApi.photoFailure = { imageIndex: 0 };
  await openForm(page);
  await page
    .getByLabel("Ảnh sản phẩm", { exact: true })
    .setInputFiles("public/figma/chair.png");
  await page.getByRole("button", { name: "Gửi duyệt", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Ảnh 1: Cần ảnh gốc có giờ chụp và vị trí GPS",
  );
  await expect(page.getByLabel("Tên sản phẩm", { exact: true })).toHaveValue(
    "Laptop kiểm tra ảnh gốc",
  );
  await expect(
    page.getByAltText("Ảnh sản phẩm 1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Gửi duyệt", exact: true }),
  ).toBeEnabled();
});

test("seller can inspect damage findings in context, search listings and confirm deletion", async ({
  page,
}) => {
  await openForm(page);
  await page.getByLabel("Ảnh sản phẩm", { exact: true }).setInputFiles({
    name: "original.heic",
    mimeType: "image/heic",
    buffer: readFileSync("../api/tests/fixtures/iphone7.heic"),
  });
  await page.getByRole("button", { name: "Gửi duyệt", exact: true }).click();
  await page
    .getByRole("heading", { name: "Tin đang chờ xét duyệt.", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Quản lý tin đăng", exact: true })
    .click();
  const card = page
    .getByRole("article")
    .filter({ hasText: "Laptop kiểm tra ảnh gốc" });
  await card
    .getByRole("button", { name: "Xem tin & kiểm tra ảnh", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Dấu hiệu hư hại", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Góc dưới bên phải có đường nứt rõ", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Ảnh 1", exact: true }),
  ).toHaveAttribute("href", "#listing-photo-0");
  await dialog.getByLabel("Đóng", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("Tìm tin của bạn").fill("không có tên này");
  await expect(card).toHaveCount(0);
  await page.getByLabel("Tìm tin của bạn").clear();
  await card.getByRole("button", { name: /^Thêm thao tác:/ }).click();
  await page.getByRole("menuitem", { name: "Xóa tin", exact: true }).click();
  await page.getByRole("button", { name: "Giữ tin", exact: true }).click();
  await expect(card).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: /^Thêm thao tác:/ }),
  ).toBeFocused();
  await card.getByRole("button", { name: /^Thêm thao tác:/ }).click();
  await page.getByRole("menuitem", { name: "Xóa tin", exact: true }).click();
  await page
    .getByRole("button", { name: "Xác nhận xóa tin", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await expect(page.getByLabel("Tìm tin của bạn")).toBeFocused();
});
