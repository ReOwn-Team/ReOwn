import {
    completeOtp,
    expect,
    test,
    testPassword,
    testUser,
    type Page,
} from "./fixtures";

async function signIn(page: Page) {
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email hoặc số điện thoại").fill(testUser.email!);
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(testPassword);
    await dialog.locator("button[type=submit]").click();
    await completeOtp(page);
}

test("anonymous visitors are blocked from admin routes", async ({
    page,
    authApi,
}) => {
    for (const path of [
        "/admin",
        "/admin/products",
        "/admin/kyc",
        "/admin/users",
    ]) {
        await page.goto(path);
        await expect(
            page.getByRole("heading", { name: "Đăng nhập để tiếp tục" }),
        ).toBeVisible();
        await expect(
            page.getByRole("navigation", { name: "Điều hướng quản trị" }),
        ).toHaveCount(0);
    }
    expect(
        authApi.requests.filter(
            (request) =>
                request.path.startsWith("/api/admin/") ||
                request.path === "/api/kyc/admin",
        ),
    ).toEqual([]);
});

test("signed-in non-admins are blocked from admin routes", async ({
    page,
    authApi,
}) => {
    await page.goto("/admin");
    await signIn(page);
    for (const path of [
        "/admin",
        "/admin/products",
        "/admin/kyc",
        "/admin/users",
    ]) {
        await page.goto(path);
        await expect(
            page.getByRole("heading", { name: "Không có quyền truy cập" }),
        ).toBeVisible();
        await expect(
            page.getByRole("navigation", { name: "Điều hướng quản trị" }),
        ).toHaveCount(0);
    }
    expect(
        authApi.requests.filter(
            (request) =>
                request.path.startsWith("/api/admin/") ||
                request.path === "/api/kyc/admin",
        ),
    ).toEqual([]);
});

test("an admin can review their own KYC", async ({ page, authApi }) => {
    authApi.setUserRole("admin");
    const id = "33333333-3333-4333-8333-333333333333";
    const user = {
        id: testUser.id,
        displayName: testUser.displayName,
        email: testUser.email,
    };
    await page.route(/\/api\/kyc\/admin(?:\/[^/]+)?$/, async (route) => {
        const path = new URL(route.request().url()).pathname;
        await route.fulfill({
            json: path.endsWith("/admin")
                ? [
                      {
                          id,
                          user,
                          flags: [],
                          faceScore: 0.8,
                          cardLayout: "white",
                          createdAt: "2026-01-01T00:00:00Z",
                      },
                  ]
                : {
                      id,
                      user,
                      flags: [],
                      faceScore: 0.8,
                      createdAt: "2026-01-01T00:00:00Z",
                      extracted: {
                          studentId: "0000000001",
                          fullName: "Nguyễn An",
                          dateOfBirth: null,
                          major: null,
                          cohort: null,
                      },
                  },
        });
    });
    let approved = false;
    await page.route(`**/api/kyc/admin/${id}/decision`, async (route) => {
        approved = route.request().postDataJSON().decision === "approve";
        await route.fulfill({ json: { status: "verified" } });
    });
    await page.goto("/admin/kyc");
    await signIn(page);
    await page.getByRole("button", { name: /Nguyễn An/ }).click();
    await page.getByRole("button", { name: "Duyệt", exact: true }).click();
    await expect.poll(() => approved).toBe(true);
});

test("admin user management searches, paginates and only exposes retained KYC evidence", async ({
    page,
    authApi,
}) => {
    authApi.setUserRole("admin");
    const nextId = "031c2768-ac31-4000-8000-000000000002";
    const pendingId = "33333333-3333-4333-8333-333333333333";
    const reviewedId = "44444444-4444-4444-8444-444444444444";
    const requestedUrls: string[] = [];
    await page.route(`**/api/kyc/admin/${pendingId}`, async (route) => {
        await route.fulfill({
            json: {
                id: pendingId,
                createdAt: "2026-01-01T00:00:00Z",
                flags: [],
                faceScore: 0.8,
                user: {
                    id: testUser.id,
                    displayName: testUser.displayName,
                    email: testUser.email,
                },
                extracted: {
                    layout: "white",
                    studentId: "2001260158",
                    studentIdSource: "barcode",
                    fullName: "Nguyễn An",
                    dateOfBirth: null,
                    major: null,
                    cohort: null,
                },
            },
        });
    });
    await page.route(
        /\/api\/admin\/users(?:\/[^/?]+)?(?:\?.*)?$/,
        async (route) => {
            const url = new URL(route.request().url());
            requestedUrls.push(`${url.pathname}${url.search}`);
            if (url.pathname === `/api/admin/users/${testUser.id}`) {
                await route.fulfill({
                    json: {
                        ...testUser,
                        kycHistory: [
                            {
                                id: pendingId,
                                status: "needs_review",
                                createdAt: "2026-01-01T00:00:00Z",
                                reviewedAt: null,
                                purgedAt: null,
                            },
                            {
                                id: reviewedId,
                                status: "verified",
                                createdAt: "2025-12-01T00:00:00Z",
                                reviewedAt: "2025-12-02T00:00:00Z",
                                purgedAt: "2025-12-02T00:00:00Z",
                            },
                        ],
                        kycHistoryTruncated: false,
                    },
                });
                return;
            }
            const cursor = url.searchParams.get("cursor");
            await route.fulfill({
                json: cursor
                    ? {
                          items: [
                              {
                                  ...testUser,
                                  id: nextId,
                                  displayName: "Trần Bình",
                              },
                          ],
                          nextCursor: null,
                      }
                    : {
                          items: [testUser],
                          nextCursor: nextId,
                      },
            });
        },
    );

    await page.goto("/admin/users");
    await signIn(page);
    await expect(
        page.getByRole("rowheader", { name: testUser.id }),
    ).toBeVisible();

    await page.getByLabel("Tìm người dùng").fill("  Nguyễn An  ");
    await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
    await expect
        .poll(() =>
            requestedUrls.some((url) =>
                url.includes("search=Nguy%E1%BB%85n+An"),
            ),
        )
        .toBe(true);

    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page.getByRole("rowheader", { name: nextId })).toBeVisible();
    await expect(page.getByText("Trang 2", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Trang trước" }).click();
    await expect(
        page.getByRole("rowheader", { name: testUser.id }),
    ).toBeVisible();

    const detailTrigger = page.getByRole("button", {
        name: /Xem chi tiết Nguyễn An/,
    });
    await detailTrigger.click();
    const dialog = page.getByRole("dialog", {
        name: "Hồ sơ người dùng",
        exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
        dialog.getByRole("heading", {
            name: "Hồ sơ người dùng",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        dialog.getByText("Lịch sử xác thực", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Xem dữ liệu KYC" }).click();
    await expect(dialog.getByText("2001260158")).toBeVisible();
    await expect(
        dialog
            .locator(`#kyc-identity-${pendingId}`)
            .getByText("Nguyễn An", { exact: true }),
    ).toBeVisible();
    await expect(
        dialog.getByText("Dữ liệu KYC không còn khả dụng từ hồ sơ này."),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(detailTrigger).toBeFocused();
});

test("admin shell displays API statistics and navigates reviews and users", async ({
    page,
    authApi,
}) => {
    authApi.setUserRole("admin");
    const requests: string[] = [];
    await page.route(
        /\/api\/(admin\/(statistics|product-reviews|users)|kyc\/admin)(\?.*)?$/,
        async (route) => {
            const path = new URL(route.request().url()).pathname;
            requests.push(path);
            const responses: Record<string, unknown> = {
                "/api/admin/statistics": {
                    users: 1234,
                    activeUsers: 987,
                    products: 432,
                    publishedProducts: 321,
                    orders: 56,
                    reports: 7,
                },
                "/api/admin/product-reviews": [
                    {
                        id: "review-1",
                        productId: "product-1",
                        revision: 2,
                        createdAt: "2026-01-01T00:00:00Z",
                        product: {
                            title: "Bàn học kiểm duyệt",
                            sellerId: testUser.id,
                            revision: 2,
                        },
                        inspections: [],
                    },
                ],
                "/api/kyc/admin": [],
                "/api/admin/users": {
                    items: [
                        { id: testUser.id, role: "user", status: "active" },
                    ],
                    nextCursor: null,
                },
            };
            await route.fulfill({ json: responses[path] });
        },
    );
    await page.goto("/admin");
    await signIn(page);

    const nav = page.getByRole("navigation", { name: "Điều hướng quản trị" });
    const isMobile = (page.viewportSize()?.width ?? 0) < 768;
    if (isMobile)
        await page
            .getByRole("button", {
                name: "Mở điều hướng quản trị",
                exact: true,
            })
            .click();
    await expect(nav).toBeVisible();
    await expect(page.locator(".admin-shell")).toBeVisible();
    await expect(
        page.locator(".site-header, .site-footer, .mobile-nav"),
    ).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Tổng quan" })).toHaveAttribute(
        "aria-current",
        "page",
    );
    const metrics = page.locator(".admin-metric");
    for (const [label, value, detail] of [
        ["Người dùng", "1.234", "987 đang hoạt động"],
        ["Tin đăng", "432", "321 đang hiển thị"],
        ["Đơn hàng", "56", "Tất cả trạng thái"],
        ["Báo cáo", "7", "Tất cả trạng thái"],
    ]) {
        const card = metrics.filter({ hasText: label });
        await expect(card.locator("strong")).toHaveText(value);
        await expect(card.locator("small")).toHaveText(detail);
    }
    await expect(
        page.getByRole("img", { name: "Người dùng hoạt động: 987 trên 1.234" }),
    ).toBeVisible();
    await expect(
        page.getByRole("img", { name: "Tin đăng đang hiển thị: 321 trên 432" }),
    ).toBeVisible();
    expect(requests).toContain("/api/admin/statistics");

    for (const [label, url, heading] of [
        ["Duyệt sản phẩm", "/admin/products", "Duyệt sản phẩm"],
        ["Xác thực sinh viên", "/admin/kyc", "Duyệt xác thực sinh viên"],
        ["Người dùng", "/admin/users", "Quản lý người dùng"],
        ["Tổng quan", "/admin", "Tổng quan"],
    ]) {
        if (isMobile) await page.goto(url);
        else await nav.getByRole("link", { name: label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${url}$`));
        await expect(
            page.getByRole("heading", { name: heading, exact: true }),
        ).toBeVisible();
        if (isMobile)
            await page
                .getByRole("button", {
                    name: "Mở điều hướng quản trị",
                    exact: true,
                })
                .click();
        await expect(
            nav.getByRole("link", { name: label, exact: true }),
        ).toHaveAttribute("aria-current", "page");
        await expect(
            page.locator(".site-header, .site-footer, .mobile-nav"),
        ).toHaveCount(0);
        if (url === "/admin/products")
            await expect(
                page.getByRole("button", { name: /Bàn học kiểm duyệt/ }),
            ).toBeVisible();
        if (url === "/admin/kyc")
            await expect(
                page.getByText("Không có hồ sơ nào chờ duyệt."),
            ).toBeVisible();
        if (url === "/admin/users")
            await expect(
                page.getByRole("rowheader", { name: testUser.id }),
            ).toBeVisible();
    }
    for (const width of isMobile ? [390] : [768, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/admin/users");
        await expect(
            page.getByRole("heading", {
                name: "Quản lý người dùng",
                exact: true,
            }),
        ).toBeVisible();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth -
                    document.documentElement.clientWidth,
            ),
            `admin users at ${width}px`,
        ).toBeLessThanOrEqual(0);
    }
    expect(requests).toEqual(
        expect.arrayContaining([
            "/api/admin/product-reviews",
            "/api/kyc/admin",
            "/api/admin/users",
        ]),
    );
});

test("admin sends permitted corrections for seller confirmation", async ({
    page,
    authApi,
}) => {
    authApi.setUserRole("admin");
    const reviewId = "11111111-1111-4111-8111-111111111111";
    const productId = "22222222-2222-4222-8222-222222222222";
    const detail = {
        id: reviewId,
        productId,
        revision: 2,
        status: "pending",
        createdAt: "2026-01-01T00:00:00Z",
        reason: null,
        product: {
            revision: 2,
            reviewStatus: "pending",
            deletedAt: null,
        },
        snapshot: {
            title: "Bàn học kiểm duyệt",
            category: "Đồ dùng",
            description: "Bàn học gỗ còn chắc chắn, phù hợp phòng trọ.",
            condition: "Dùng tốt",
            knownDefects: "Có vết xước nhỏ ở cạnh bàn.",
            price: 450000,
            location: "TP. Hồ Chí Minh",
            fulfillmentMethods: ["meetup"],
            images: [],
        },
        inspections: [],
        evidence: [],
    };
    let editBody: Record<string, unknown> | null = null;
    await page.route(
        /\/api\/admin\/product-reviews(?:\/[^/?]+)?(?:\/edits)?(?:\?.*)?$/,
        async (route) => {
            const path = new URL(route.request().url()).pathname;
            if (path === "/api/admin/product-reviews") {
                await route.fulfill({
                    json: [
                        {
                            id: reviewId,
                            productId,
                            revision: 2,
                            createdAt: detail.createdAt,
                            product: {
                                title: detail.snapshot.title,
                                sellerId: testUser.id,
                                revision: 2,
                            },
                            inspections: [],
                        },
                    ],
                });
                return;
            }
            if (path === `/api/admin/product-reviews/${reviewId}`) {
                await route.fulfill({ json: detail });
                return;
            }
            if (path === `/api/admin/product-reviews/${reviewId}/edits`) {
                editBody = route.request().postDataJSON();
                await route.fulfill({
                    json: { status: "seller_confirmation" },
                });
                return;
            }
            await route.fulfill({ status: 404, json: {} });
        },
    );

    await page.goto("/admin/products");
    await signIn(page);
    await page.getByRole("button", { name: /Bàn học kiểm duyệt/ }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/products/${reviewId}$`));
    await page.getByLabel("Tên sản phẩm").fill("Bàn học gỗ đã kiểm tra");
    await page
        .getByLabel("Ghi chú gửi người bán (không bắt buộc)")
        .fill("Vui lòng kiểm tra lại tên sản phẩm trước khi đăng.");
    await expect(page.getByLabel("Giá bán (chỉ xem)")).toHaveCount(0);
    await page.getByRole("button", { name: "Gửi người bán xác nhận" }).click();

    await expect
        .poll(() => editBody)
        .toEqual({
            revision: 2,
            changes: { title: "Bàn học gỗ đã kiểm tra" },
            note: "Vui lòng kiểm tra lại tên sản phẩm trước khi đăng.",
        });
    await expect(page).toHaveURL(/\/admin\/products$/);
});
