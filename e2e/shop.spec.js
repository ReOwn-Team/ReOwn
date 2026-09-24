import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
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
  await expect(sale.locator('.ostatus')).toHaveText('Cần gửi hàng');
  await sale.getByRole('button', { name: 'Xác nhận đã gửi hàng' }).click();
  await page.getByRole('tab', { name: /Đang giao/ }).click();
  const shipping = page.locator('.ocard').filter({ hasText: 'Casio' }).first();
  await expect(shipping.locator('.ostatus')).toHaveText('Đang giao');
  await expect(shipping).toContainText('Đang chờ khách nhận hàng');

  await logout(page);
  await login(page, 'lan');
  await page.goto('#/tai-khoan?tab=don-mua');
  const mine = page.locator('.ocard').filter({ hasText: 'Casio' }).first();
  await expect(mine.getByRole('button', { name: /Mô phỏng/ })).toHaveCount(0);
  await mine.getByRole('button', { name: 'Đã nhận hàng' }).click();
  await expect(mine.locator('.ostatus')).toHaveText('Hoàn tất');
});

test('khiếu nại hàng sai mô tả bắt buộc kèm ảnh', async ({ page }) => {
  await login(page, 'huy');
  await openProduct(page, 'quat dung senko');
  await page.getByRole('radio', { name: /Trả thẳng/ }).click();
  await page.locator('.buy-row .btn-buy').click();
  await page.getByRole('button', { name: 'Đặt hàng' }).click();
  await expect(page.locator('.ocard').filter({ hasText: 'Senko' }).first().locator('.ostatus')).toHaveText('Chờ người bán gửi');

  await logout(page);
  await login(page, 'bao');
  await page.goto('#/kenh-nguoi-ban?don=can-gui');
  await page.locator('.ocard').filter({ hasText: 'Senko' }).first().getByRole('button', { name: 'Xác nhận đã gửi hàng' }).click();
  await expect(page.locator('.ocard').filter({ hasText: 'Senko' })).toHaveCount(0);

  await logout(page);
  await login(page, 'huy');
  await page.goto('#/tai-khoan?tab=don-mua');
  const order = page.locator('.ocard').filter({ hasText: 'Senko' }).first();
  await order.getByRole('button', { name: 'Hàng không đúng mô tả' }).click();
  await order.getByLabel(/Mô tả vấn đề/).fill('Quạt không quay, gãy một cánh khi mở hộp');
  await order.getByRole('button', { name: 'Gửi khiếu nại' }).click();
  await expect(order.getByRole('alert')).toContainText('ít nhất 1 ảnh');
  const png = await sharp({ create: { width: 240, height: 240, channels: 3, background: '#c33' } }).png().toBuffer();
  await order.locator('input[type=file]').setInputFiles({ name: 'loi.png', mimeType: 'image/png', buffer: png });
  await expect(order.locator('.photo img')).toHaveCount(1);
  await order.getByRole('button', { name: 'Gửi khiếu nại' }).click();
  await expect(order.locator('.ostatus')).toHaveText('Đang khiếu nại');
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
  await page.getByLabel(/Lý do gỡ/).selectOption('Khác');
  await page.getByRole('button', { name: 'Xác nhận gỡ' }).click();
  await expect(page.locator('.hide-form [role=alert]')).toContainText('Nhập lý do');
  await page.getByLabel('Lý do khác').fill('Đăng trùng nhiều lần cùng một sản phẩm');
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
