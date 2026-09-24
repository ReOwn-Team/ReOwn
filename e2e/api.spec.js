import { test, expect } from '@playwright/test';

test.beforeEach(({ }, info) => { test.skip(info.project.name !== 'api', 'chỉ chạy khi nối máy chủ'); });

test('số mới đăng ký: hỏi tên SAU bước OTP', async ({ page }) => {
  await page.goto('#/dang-nhap');
  await page.locator('#ph').fill('0977' + String(Date.now()).slice(-6));
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.locator('#nm')).toHaveCount(0);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.locator('#nm').fill('Sinh Viên Thử');
  await page.getByRole('button', { name: 'Hoàn tất' }).click();
  await expect(page.locator('.pmenu-btn')).toContainText('Thử');
});
