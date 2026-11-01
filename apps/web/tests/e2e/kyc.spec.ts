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
  await dialog.locator('input[type="file"]').setInputFiles(image);
  await expect(dialog.getByAltText(/Ảnh mặt trước thẻ/)).toBeVisible();
  await dialog.getByRole("button", { name: "Tiếp tục", exact: true }).click();
}

async function chooseSelfie(dialog: ReturnType<Page["getByRole"]>) {
  await dialog.locator('input[type="file"]').setInputFiles(image);
  await expect(dialog.getByAltText("Ảnh chân dung bạn vừa chụp")).toBeVisible();
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

  await dialog.getByRole("button", { name: /Rút hồ sơ và xoá dữ liệu/ }).click();
  await expect(dialog.getByLabel(/Tôi đồng ý/)).not.toBeChecked();
  expect(authApi.kycStatus).toBe("none");
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
  await expect(dialog.getByRole("alert")).toContainText("Ảnh chân dung bị mờ");
  await expect(dialog.getByRole("button", { name: "Bật camera" })).toBeVisible();
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
  await expect(dialog.getByText(/chưa được duyệt: Ảnh thẻ bị loá/)).toBeVisible();
});

test("the verification dialog has no axe violations", async ({ page }) => {
  const dialog = await openVerification(page);
  await expect(dialog.getByLabel(/Tôi đồng ý/)).toBeVisible();
  const consentResult = await new AxeBuilder({ page }).analyze();
  expect(consentResult.violations).toEqual([]);
  await consent(dialog);
  await expect(
    dialog.getByRole("button", { name: "Chụp hoặc chọn ảnh thẻ" }),
  ).toBeVisible();
  const cardResult = await new AxeBuilder({ page }).analyze();
  expect(cardResult.violations).toEqual([]);
  await chooseCard(dialog);
  await expect(dialog.getByRole("button", { name: "Bật camera" })).toBeVisible();
  const selfieResult = await new AxeBuilder({ page }).analyze();
  expect(selfieResult.violations).toEqual([]);
});
