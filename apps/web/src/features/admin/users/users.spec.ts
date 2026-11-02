import {
    completeOtp,
    expect,
    test,
    testPassword,
    testUser,
} from "../../../../tests/e2e/fixtures";

test("server search resets pagination and retained KYC identity is loaded only on request", async ({
    page,
    authApi,
}) => {
    authApi.setUserRole("admin");
    const searches: string[] = [];
    const assets: string[] = [];
    const pending = "33333333-3333-4333-8333-333333333333";
    const done = "44444444-4444-4444-8444-444444444444";
    const user = { ...testUser, role: "user", kycStatus: 1 };
    await page.route("**/api/admin/users**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/users")) {
            searches.push(url.search);
            await route.fulfill({
                json: {
                    items: [user],
                    nextCursor: url.searchParams.has("cursor") ? null : "next",
                },
            });
        } else {
            await route.fulfill({
                json: {
                    ...user,
                    kycHistoryTruncated: false,
                    kycHistory: [
                        {
                            id: pending,
                            status: "needs_review",
                            createdAt: "2026-01-01T00:00:00Z",
                            reviewedAt: null,
                            purgedAt: null,
                        },
                        {
                            id: done,
                            status: "verified",
                            createdAt: "2025-01-01T00:00:00Z",
                            reviewedAt: "2025-01-02T00:00:00Z",
                            purgedAt: "2025-01-02T00:00:00Z",
                        },
                    ],
                },
            });
        }
    });
    await page.route(`**/api/kyc/admin/${pending}`, async (route) => {
        await route.fulfill({
            json: {
                id: pending,
                createdAt: "2026-01-01T00:00:00Z",
                flags: [],
                faceScore: 0.8,
                user: {
                    id: user.id,
                    displayName: user.displayName,
                    email: user.email,
                },
                extracted: {
                    studentId: "2001260158",
                    fullName: "Nguyễn An",
                    dateOfBirth: null,
                    major: null,
                    cohort: null,
                    layout: null,
                    studentIdSource: "barcode",
                },
            },
        });
    });
    await page.route("**/api/kyc/admin/**/assets/**", async (route) => {
        assets.push(route.request().url());
        await route.fulfill({ status: 404 });
    });
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email hoặc số điện thoại").fill(testUser.email!);
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page.getByText("Trang 2")).toBeVisible();
    await page.getByLabel("Tìm người dùng").fill("An & Bình");
    await page.getByRole("button", { name: "Tìm kiếm" }).click();
    await expect(page.getByText("Trang 1")).toBeVisible();
    expect(new URLSearchParams(searches.at(-1)).get("search")).toBe(
        "An & Bình",
    );
    expect(new URLSearchParams(searches.at(-1)).has("cursor")).toBe(false);
    await page.getByRole("button", { name: /Xem chi tiết/ }).click();
    await expect(page.getByText("Lịch sử xác thực")).toBeVisible();
    expect(assets).toEqual([]);
    await page.getByRole("button", { name: "Xem dữ liệu KYC" }).click();
    await expect(page.getByText("2001260158")).toBeVisible();
    await expect(page.getByText("Nguyễn An")).toBeVisible();
    await expect.poll(() => assets.length).toBe(2);
    expect(assets.every((url) => url.includes(pending))).toBe(true);
    await expect(page.getByText(/Không tải được ảnh/)).toHaveCount(2);
});
