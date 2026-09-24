import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fresh, login, logout, adminGate, openProduct } from './helpers.js';

test.beforeEach(async ({ page }) => { await fresh(page); });

test('tìm kiếm chịu gõ sai và không dấu', async ({ page }) => {
  await page.goto('#/tim-kiem?q=thinkpat');
  await expect(page.locator('.results .pcard-title')).toHaveText([/ThinkPad T480/]);
  await page.goto('#/tim-kiem?q=den%20hoc');
  await expect(page.locator('.results .pcard-title').first()).toContainText('Đèn học');
});

test('ảnh sản phẩm: thiếu file thì hiện hình minh hoạ', async ({ page }) => {
  await page.route('**/img/products/**', (r) => r.fulfill({ status: 404 }));
  await openProduct(page, 'latitude 7490');
  await expect(page.locator('.pd-media .art .glyph')).toBeVisible();
});

test('đăng xuất chỉ hiện khi mở menu hồ sơ', async ({ page }) => {
  await login(page, 'lan');
  await expect(page.locator('header').getByText(/Đăng xuất|Đổi tài khoản/)).toHaveCount(0);
  await page.locator('.pmenu-btn').click();
  await expect(page.getByRole('menuitem', { name: /Đăng xuất|Đổi tài khoản/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('đặt hàng → người bán gửi → người mua nhận hàng', async ({ page }) => {
  await login(page, 'lan');
  await page.goto('#/tim-kiem?q=casio');
  await page.locator('.results .pcard').first().click();
  await page.getByRole('radio', { name: /Trả thẳng/ }).click();
  await page.locator('.buy-row .btn-buy').click();
  await page.getByRole('button', { name: 'Đặt hàng' }).click();
  const order = page.locator('.ocard').filter({ hasText: 'Casio' }).first();
  await expect(order.locator('.ostatus')).toHaveText('Chờ người bán gửi');
  await expect(order.getByRole('button', { name: 'Đã nhận hàng' })).toHaveCount(0);

  await logout(page);
  await login(page, 'bao');
  await page.goto('#/kenh-nguoi-ban');
  const sale = page.locator('.ocard').filter({ hasText: 'Casio' }).first();
  await sale.getByRole('button', { name: 'Xác nhận đã gửi hàng' }).click();
  await expect(sale.locator('.ostatus')).toHaveText('Đang giao');

  await logout(page);
  await login(page, 'lan');
  await page.goto('#/tai-khoan?tab=don-mua');
  const mine = page.locator('.ocard').filter({ hasText: 'Casio' }).first();
  await mine.getByRole('button', { name: 'Đã nhận hàng' }).click();
  await expect(mine.locator('.ostatus')).toHaveText('Hoàn tất');
});

test('chat: chặn đòi chuyển khoản ngoài ReOwn', async ({ page }) => {
  await login(page, 'minh'); // máy chủ giới hạn 3 mã OTP / 10 phút / số — mỗi test dùng số khác nhau khi có thể
  await openProduct(page, 'iphone xr');
  await page.locator('.buy-row').getByRole('button', { name: /Chat với người bán/ }).click();
  await page.locator('#msg').fill('Bạn chuyển khoản trước giữ hàng giúp mình nhé');
  await page.getByRole('button', { name: 'Gửi' }).click();
  await expect(page.locator('.composer-err')).toContainText('chuyển khoản');
});

test('admin gỡ tin ngay trên trang sản phẩm', async ({ page }) => {
  await login(page, 'admin');
  await adminGate(page);
  await openProduct(page, 'elitebook');
  await page.locator('.adm-box').getByRole('button', { name: 'Gỡ tin' }).click();
  await page.getByRole('button', { name: 'Xác nhận gỡ' }).click();
  await expect(page).toHaveURL(/quan-tri/);
  await page.goto('#/tim-kiem?q=elitebook');
  await expect(page.locator('.results .pcard')).toHaveCount(0);
});

for (const path of ['', 'tim-kiem?q=laptop', 'product', 'dang-nhap']) {
  test(`không có lỗi truy cập (axe): /${path}`, async ({ page }) => {
    if (path === 'product') await openProduct(page, 'thinkpad'); else await page.goto('#/' + path);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });
}
