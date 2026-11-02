import AxeBuilder from "@axe-core/playwright";
import { completeOtp, expect, test, type Page } from "./fixtures";

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
}

const image = "public/figma/chair.png";

async function openVerification(page: Page) {
    await page.addInitScript(() => {
        const state = window as typeof window & {
            cameraTracks: MediaStreamTrack[];
            cameraConstraints: MediaStreamConstraints[];
        };
        state.cameraTracks = [];
        state.cameraConstraints = [];
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: async (constraints: MediaStreamConstraints) => {
                    state.cameraConstraints.push(constraints);
                    const canvas = document.createElement("canvas");
                    canvas.width = 640;
                    canvas.height = 480;
                    canvas.getContext("2d")?.fillRect(0, 0, 640, 480);
                    const stream = canvas.captureStream(10);
                    state.cameraTracks.push(...stream.getTracks());
                    return stream;
                },
            },
        });
    });
    await page.goto("/account");
    await login(page);
    await page
        .getByRole("button", { name: "Xác thực bằng thẻ sinh viên" })
        .click();
    return page.getByRole("dialog");
}

async function consent(dialog: ReturnType<Page["getByRole"]>) {
    const next = dialog.getByRole("button", { name: "Tiếp tục", exact: true });
    await expect(next).toBeDisabled();
    await dialog.getByLabel(/Tôi đồng ý/).check();
    await next.click();
}

async function chooseCard(dialog: ReturnType<Page["getByRole"]>) {
    const picker = dialog.locator('input[type="file"]');
    await expect(picker).toHaveCount(1);
    await expect(picker).not.toHaveAttribute("capture");
    await picker.setInputFiles(image);
    await expect(dialog.getByAltText(/Ảnh mặt trước thẻ/)).toBeVisible();
    await dialog.getByRole("button", { name: "Tiếp tục", exact: true }).click();
}

async function chooseSelfie(dialog: ReturnType<Page["getByRole"]>) {
    await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
    await dialog.getByRole("button", { name: "Bật camera" }).click();
    const video = dialog.locator("video");
    await expect
        .poll(() => video.evaluate((el: HTMLVideoElement) => el.videoWidth))
        .toBeGreaterThan(0);
    await dialog.getByRole("button", { name: "Chụp ảnh", exact: true }).click();
    await expect(
        dialog.getByAltText("Ảnh chân dung bạn vừa chụp"),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Tiếp tục", exact: true }).click();
}

test("a student can consent, add both photos, submit and withdraw", async ({
    page,
    authApi,
}) => {
    const dialog = await openVerification(page);
    await expect(
        dialog.getByRole("heading", { name: "Xác thực sinh viên" }),
    ).toBeVisible();
    await consent(dialog);
    await chooseCard(dialog);
    await chooseSelfie(dialog);
    await expect(dialog.getByAltText("Mặt trước thẻ sinh viên")).toBeVisible();
    await expect(dialog.getByAltText("Ảnh chân dung")).toBeVisible();
    await dialog.getByRole("button", { name: "Gửi xác thực" }).click();
    await expect(
        dialog.getByRole("heading", { name: "Hồ sơ đang chờ duyệt" }),
    ).toBeVisible();
    expect(authApi.kycStatus).toBe("needs_review");

    await dialog
        .getByRole("button", { name: /Rút hồ sơ và xoá dữ liệu/ })
        .click();
    await expect(
        dialog.getByText(/nhật ký kiểm toán vẫn có thể được lưu/),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Huỷ", exact: true }).click();
    expect(authApi.kycStatus).toBe("needs_review");
    await dialog
        .getByRole("button", { name: /Rút hồ sơ và xoá dữ liệu/ })
        .click();
    await dialog.getByRole("button", { name: "Xác nhận rút hồ sơ" }).click();
    await expect(dialog.getByLabel(/Tôi đồng ý/)).not.toBeChecked();
    expect(authApi.kycStatus).toBe("none");
});

test("card rear camera captures, retakes and stops before the selfie step", async ({
    page,
}) => {
    const dialog = await openVerification(page);
    await consent(dialog);
    await dialog.getByRole("button", { name: "Bật camera sau" }).click();
    const video = dialog.locator("video");
    await expect
        .poll(() => video.evaluate((el: HTMLVideoElement) => el.videoWidth))
        .toBeGreaterThan(0);
    const constraints = await page.evaluate(
        () =>
            (
                window as typeof window & {
                    cameraConstraints: MediaStreamConstraints[];
                }
            ).cameraConstraints,
    );
    expect(constraints[0]).toMatchObject({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
    });
    await dialog.getByRole("button", { name: "Chụp ảnh thẻ" }).click();
    await expect(dialog.getByAltText(/Ảnh mặt trước thẻ/)).toBeVisible();
    await expect
        .poll(() =>
            page.evaluate(() =>
                (
                    window as typeof window & {
                        cameraTracks: MediaStreamTrack[];
                    }
                ).cameraTracks.map((track) => track.readyState),
            ),
        )
        .toEqual(["ended"]);
    await dialog.getByRole("button", { name: "Chụp lại thẻ" }).click();
    await dialog.getByRole("button", { name: "Bật camera sau" }).click();
    await expect(
        dialog.getByRole("button", { name: "Tắt camera" }),
    ).toBeVisible();
    await dialog.locator('input[type="file"]').setInputFiles(image);
    await expect(dialog.getByAltText(/Ảnh mặt trước thẻ/)).toBeVisible();
    await expect
        .poll(() =>
            page.evaluate(() =>
                (
                    window as typeof window & {
                        cameraTracks: MediaStreamTrack[];
                    }
                ).cameraTracks.map((track) => track.readyState),
            ),
        )
        .toEqual(["ended", "ended"]);
    await dialog.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await expect(
        dialog.getByRole("button", { name: "Bật camera", exact: true }),
    ).toBeVisible();
});

test("card camera permission failure keeps library available", async ({
    page,
}) => {
    const dialog = await openVerification(page);
    await consent(dialog);
    await page.evaluate(() => {
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: async () => {
                    throw new Error("denied");
                },
            },
        });
    });
    await dialog.getByRole("button", { name: "Bật camera sau" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
        "quyền truy cập camera",
    );
    await chooseCard(dialog);
});

test("a late card camera request is stopped after closing the dialog", async ({
    page,
}) => {
    const dialog = await openVerification(page);
    await consent(dialog);
    await page.evaluate(() => {
        const state = window as typeof window & {
            cameraTracks: MediaStreamTrack[];
            resolveCamera: () => void;
        };
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: () =>
                    new Promise<MediaStream>((resolve) => {
                        state.resolveCamera = () => {
                            const stream = document
                                .createElement("canvas")
                                .captureStream();
                            state.cameraTracks.push(...stream.getTracks());
                            resolve(stream);
                        };
                    }),
            },
        });
    });
    await dialog.getByRole("button", { name: "Bật camera sau" }).click();
    await expect(
        dialog.getByRole("button", { name: "Đang mở camera…" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.evaluate(() =>
        (
            window as typeof window & { resolveCamera: () => void }
        ).resolveCamera(),
    );
    await expect
        .poll(() =>
            page.evaluate(() =>
                (
                    window as typeof window & {
                        cameraTracks: MediaStreamTrack[];
                    }
                ).cameraTracks.map((track) => track.readyState),
            ),
        )
        .toEqual(["ended"]);
});

test("camera errors offer retry without a file picker", async ({ page }) => {
    const dialog = await openVerification(page);
    await consent(dialog);
    await chooseCard(dialog);
    await page.evaluate(() => {
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: undefined,
        });
    });
    await dialog.getByRole("button", { name: "Bật camera" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
        "không hỗ trợ camera",
    );
    await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
    await page.evaluate(() => {
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: async () => {
                    throw new Error("denied");
                },
            },
        });
    });
    await dialog.getByRole("button", { name: "Bật camera" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
        "quyền truy cập camera",
    );
    await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
});

test("camera tracks stop after capture, manual stop and leaving the step", async ({
    page,
}) => {
    const dialog = await openVerification(page);
    await consent(dialog);
    await chooseCard(dialog);
    const states = () =>
        page.evaluate(() =>
            (
                window as typeof window & { cameraTracks: MediaStreamTrack[] }
            ).cameraTracks.map((track) => track.readyState),
        );
    await dialog.getByRole("button", { name: "Bật camera" }).click();
    await expect(
        dialog.getByRole("button", { name: "Tắt camera" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Tắt camera" }).click();
    await expect.poll(states).toEqual(["ended"]);
    await chooseSelfie(dialog);
    await expect.poll(states).toEqual(["ended", "ended"]);
    await dialog.getByRole("button", { name: "Quay lại" }).click();
    await dialog.getByRole("button", { name: "Chụp lại" }).click();
    await dialog.getByRole("button", { name: "Bật camera" }).click();
    await expect(
        dialog.getByRole("button", { name: "Tắt camera" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Quay lại" }).click();
    await expect.poll(states).toEqual(["ended", "ended", "ended"]);
});

test("a camera request resolving after the dialog closes is stopped", async ({
    page,
}) => {
    const dialog = await openVerification(page);
    await consent(dialog);
    await chooseCard(dialog);
    await page.evaluate(() => {
        const state = window as typeof window & {
            cameraTracks: MediaStreamTrack[];
            resolveCamera: () => void;
        };
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: () =>
                    new Promise<MediaStream>((resolve) => {
                        state.resolveCamera = () => {
                            const canvas = document.createElement("canvas");
                            const stream = canvas.captureStream();
                            state.cameraTracks.push(...stream.getTracks());
                            resolve(stream);
                        };
                    }),
            },
        });
    });
    await dialog.getByRole("button", { name: "Bật camera" }).click();
    await expect(
        dialog.getByRole("button", { name: "Đang mở camera…" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.evaluate(() =>
        (
            window as typeof window & { resolveCamera: () => void }
        ).resolveCamera(),
    );
    await expect
        .poll(() =>
            page.evaluate(() =>
                (
                    window as typeof window & {
                        cameraTracks: MediaStreamTrack[];
                    }
                ).cameraTracks.map((track) => track.readyState),
            ),
        )
        .toEqual(["ended"]);
});

test("unusable photos send the user back to retake the right one", async ({
    page,
    authApi,
}) => {
    const dialog = await openVerification(page);
    await consent(dialog);
    await chooseCard(dialog);
    await chooseSelfie(dialog);
    authApi.kycOutcome = {
        status: 422,
        body: { error: "KYC_RETAKE", issues: ["SELFIE_BLURRY"] },
    };
    await dialog.getByRole("button", { name: "Gửi xác thực" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
        "Ảnh chân dung bị mờ",
    );
    await expect(
        dialog.getByRole("button", { name: "Bật camera" }),
    ).toBeVisible();
    // The card photo is kept; only the selfie must be retaken.
    expect(authApi.kycStatus).toBe("none");
});

test("business errors are explained without exposing details", async ({
    page,
    authApi,
}) => {
    const dialog = await openVerification(page);
    await consent(dialog);
    await chooseCard(dialog);
    await chooseSelfie(dialog);
    authApi.kycOutcome = {
        status: 409,
        body: { error: "KYC_STUDENT_ID_IN_USE" },
    };
    await dialog.getByRole("button", { name: "Gửi xác thực" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
        "đã được dùng để xác thực một tài khoản khác",
    );
});

test("an unavailable server and a rejected review are explained", async ({
    page,
    authApi,
}) => {
    authApi.kycAvailable = false;
    let dialog = await openVerification(page);
    await expect(dialog.getByText(/chưa sẵn sàng trên máy chủ/)).toBeVisible();
    await expect(dialog.getByLabel(/Tôi đồng ý/)).toHaveCount(0);

    authApi.kycAvailable = true;
    authApi.kycStatus = "rejected";
    await page.reload();
    await page
        .getByRole("button", { name: "Xác thực bằng thẻ sinh viên" })
        .click();
    dialog = page.getByRole("dialog");
    await expect(
        dialog.getByText(/chưa được duyệt: Ảnh thẻ bị loá/),
    ).toBeVisible();
});

test("the verification dialog has no axe violations", async ({ page }) => {
    const dialog = await openVerification(page);
    await expect(dialog.getByLabel(/Tôi đồng ý/)).toBeVisible();
    const consentResult = await new AxeBuilder({ page }).analyze();
    expect(consentResult.violations).toEqual([]);
    await consent(dialog);
    await expect(
        dialog.getByRole("button", { name: "Chọn ảnh thẻ từ thư viện" }),
    ).toBeVisible();
    const cardResult = await new AxeBuilder({ page }).analyze();
    expect(cardResult.violations).toEqual([]);
    await chooseCard(dialog);
    await expect(
        dialog.getByRole("button", { name: "Bật camera" }),
    ).toBeVisible();
    const selfieResult = await new AxeBuilder({ page }).analyze();
    expect(selfieResult.violations).toEqual([]);
});
