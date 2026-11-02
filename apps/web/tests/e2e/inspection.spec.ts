import { test, expect, completeOtp, testPassword, testUser } from "./fixtures";
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
        .fill(
            "Laptop dùng cho việc học tập, có ảnh chụp bên ngoài để đối chiếu.",
        );
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
    await page
        .getByRole("button", { name: "Lưu bản nháp", exact: true })
        .click();
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
        page.getByRole("heading", {
            name: "Tin đang chờ xét duyệt.",
            exact: true,
        }),
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
test("seller confirmation locks corrected terms and submits unchanged terms with title and price", async ({
    page,
}) => {
    const id = "55555555-5555-4555-8555-555555555555";
    const correctedProduct = {
        id,
        title: "Bàn học đã điều chỉnh",
        category: "Đồ dùng",
        description:
            "Bàn học gỗ còn chắc chắn, phù hợp với phòng trọ sinh viên.",
        price: 450000,
        condition: "Dùng tốt",
        knownDefects: "Có vết xước nhỏ ở cạnh bàn.",
        location: "TP. Hồ Chí Minh",
        fulfillmentMethods: ["meetup"],
        images: [
            {
                id: "66666666-6666-4666-8666-666666666666",
                url: "/api/product-images/66666666-6666-4666-8666-666666666666",
                mimeType: "image/webp",
                sizeBytes: 1000,
            },
        ],
        seller: { id: testUser.id, displayName: testUser.displayName },
        reviewStatus: "seller_confirmation",
        rejectionReason: "Vui lòng kiểm tra lại tên sản phẩm trước khi đăng.",
        revision: 2,
        status: "hidden",
        publishedAt: null,
        updatedAt: "2026-01-01T00:00:00Z",
    };
    let submitted: Record<string, unknown> | null = null;
    await page.route("**/api/products/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (
            pathname === `/api/products/mine/${id}` &&
            route.request().method() === "GET"
        ) {
            await route.fulfill({ json: correctedProduct });
            return;
        }
        if (
            pathname === `/api/products/${id}` &&
            route.request().method() === "PUT"
        ) {
            const headers = route.request().headers();
            const form = await new Request(route.request().url(), {
                method: "POST",
                headers: { "Content-Type": headers["content-type"] },
                body: new Uint8Array(route.request().postDataBuffer()!),
            }).formData();
            const data = JSON.parse(String(form.get("data"))) as Record<
                string,
                unknown
            >;
            submitted = data;
            await route.fulfill({
                json: {
                    ...correctedProduct,
                    title: data.title,
                    price: data.price,
                    reviewStatus: "approved",
                    status: "published",
                    publishedAt: "2026-01-02T00:00:00Z",
                },
            });
            return;
        }
        await route.fallback();
    });

    await page.goto(`/sell?edit=${id}`);
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

    await expect(
        page.getByRole("heading", {
            name: "Quản trị viên đã điều chỉnh tin đăng",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByText(/bạn chỉ có thể thay đổi tên sản phẩm và giá bán/i),
    ).toBeVisible();
    await expect(page.getByLabel("Tên sản phẩm")).toBeEnabled();
    await expect(page.getByLabel("Giá bán (đ)", { exact: true })).toBeEnabled();
    await expect(page.getByLabel("Danh mục", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Mô tả chi tiết")).toBeDisabled();
    await expect(
        page.getByLabel("Trầy xước, lỗi hoặc điểm cần lưu ý"),
    ).toBeDisabled();
    await expect(page.getByLabel("Khu vực bán")).toBeDisabled();
    await expect(
        page.getByLabel("Ảnh sản phẩm", { exact: true }),
    ).toBeDisabled();
    await expect(
        page.getByRole("button", { name: "Xóa ảnh 1" }),
    ).toBeDisabled();

    await page.getByLabel("Tên sản phẩm").fill("Bàn học gỗ đã xác nhận");
    await page.getByLabel("Giá bán (đ)", { exact: true }).fill("475000");
    await page
        .getByRole("checkbox", {
            name: "Tôi đã kiểm tra thông tin quản trị viên điều chỉnh và đồng ý đăng tin.",
        })
        .check();
    await page
        .getByRole("button", { name: "Xác nhận và đăng tin", exact: true })
        .click();

    await expect
        .poll(() => submitted)
        .toMatchObject({
            title: "Bàn học gỗ đã xác nhận",
            price: 475000,
            category: correctedProduct.category,
            description: correctedProduct.description,
            condition: correctedProduct.condition,
            knownDefects: correctedProduct.knownDefects,
            location: correctedProduct.location,
            fulfillmentMethods: correctedProduct.fulfillmentMethods,
            confirmed: true,
            images: [{ id: correctedProduct.images[0].id }],
        });
    await expect(
        page.getByRole("heading", { name: "Tin đã được đăng.", exact: true }),
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
