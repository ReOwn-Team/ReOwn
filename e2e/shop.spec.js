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
  await expect(page.locator('#ship-err')).toBeVisible();
  await page.getByLabel(/Người nhận/).fill('Trần Ngọc Lan · 0900000002 · KTX khu B');
  await page.getByRole('button', { name: 'Đặt hàng' }).click();
  const order = page.locator('.ocard').filter({ hasText: 'Casio' }).first();
  await expect(order.locator('.ostatus')).toHaveText('Chờ người bán gửi');
  await expect(order.getByRole('button', { name: 'Đã nhận hàng' })).toHaveCount(0);

  await logout(page);
  await login(page, 'bao');
  await page.goto('#/kenh-nguoi-ban');
  const sale = page.locator('.ocard').filter({ hasText: 'Casio' }).first();
  await expect(sale.locator('.ostatus')).toHaveText('Cần gửi hàng');
  await expect(sale).toContainText('KTX khu B');
  await sale.getByRole('button', { name: 'Xác nhận đã gửi hàng' }).click();
  await sale.getByPlaceholder('Mã vận đơn').fill('GHN12345678');
  await sale.getByRole('button', { name: 'Xác nhận đã gửi' }).click();
  await page.getByRole('tab', { name: /Đang giao/ }).click();
  const shipping = page.locator('.ocard').filter({ hasText: 'Casio' }).first();
  await expect(shipping.locator('.ostatus')).toHaveText('Đang giao');
  await expect(shipping).toContainText('Đang chờ khách nhận hàng');

  await logout(page);
  await login(page, 'lan');
  await page.goto('#/tai-khoan?tab=don-mua');
  const mine = page.locator('.ocard').filter({ hasText: 'Casio' }).first();
  await expect(mine.getByRole('button', { name: /Mô phỏng/ })).toHaveCount(0);
  await expect(mine).toContainText('GHN12345678');
  await mine.getByRole('button', { name: 'Đã nhận hàng' }).click();
  await mine.getByRole('button', { name: /Xác nhận · 5 sao/ }).click();
  await expect(mine.locator('.ostatus')).toHaveText('Hoàn tất');
});

test('khiếu nại hàng sai mô tả bắt buộc kèm ảnh', async ({ page }) => {
  await login(page, 'huy');
  await openProduct(page, 'quat dung senko');
  await page.getByRole('radio', { name: /Trả thẳng/ }).click();
  await page.locator('.buy-row .btn-buy').click();
  await page.getByLabel(/Người nhận/).fill('Lê Quốc Huy · 0900000003 · Tân Phú');
  await page.getByRole('button', { name: 'Đặt hàng' }).click();
  await expect(page.locator('.ocard').filter({ hasText: 'Senko' }).first().locator('.ostatus')).toHaveText('Chờ người bán gửi');

  await logout(page);
  await login(page, 'bao');
  await page.goto('#/kenh-nguoi-ban?don=can-gui');
  const toShip = page.locator('.ocard').filter({ hasText: 'Senko' }).first();
  await toShip.getByRole('button', { name: 'Xác nhận đã gửi hàng' }).click();
  await toShip.getByPlaceholder('Mã vận đơn').fill('GHTK99887766');
  await toShip.getByRole('button', { name: 'Xác nhận đã gửi' }).click();
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

  await logout(page);
  await login(page, 'bao');
  await page.goto('#/kenh-nguoi-ban');
  await expect(page.getByRole('tab', { name: /Khiếu nại & trả hàng/ })).toHaveAttribute('aria-selected', 'true');
  const claim = page.locator('.ocard').filter({ hasText: 'Senko' }).first();
  await claim.getByLabel(/Phản hồi khiếu nại/).fill('Mình có video đóng gói, quạt nguyên vẹn khi gửi');
  await claim.getByRole('button', { name: 'Gửi phản hồi' }).click();
  await expect(claim).toContainText('Phản hồi của bạn');

  await logout(page);
  await login(page, 'admin');
  await adminGate(page);
  await page.locator('.adm-nav').getByRole('button', { name: /Tranh chấp/ }).click();
  const card = page.locator('.dcard').filter({ hasText: 'Senko' }).first();
  await card.locator('.dcard-head').click();
  await expect(card).toContainText('Mình có video đóng gói');
  await expect(card.locator('.evidence img')).toHaveCount(1);
  await card.getByLabel('Kết luận').fill('Cánh quạt gãy — trả hàng để hoàn tiền');
  await card.getByRole('button', { name: 'Trả hàng rồi hoàn tiền' }).click();

  await logout(page);
  await login(page, 'huy');
  await page.goto('#/tai-khoan?tab=don-mua');
  const back = page.locator('.ocard').filter({ hasText: 'Senko' }).first();
  await expect(back.locator('.ostatus')).toHaveText('Chờ gửi trả hàng');
  await back.getByPlaceholder('Mã vận đơn').fill('GHN55554444');
  await back.getByRole('button', { name: 'Đã gửi trả' }).click();
  await expect(back.locator('.ostatus')).toHaveText('Đang gửi trả');
});

test('gặp trực tiếp: người bán nhập mã người mua đọc để hoàn tất đơn', async ({ page }, info) => {
  test.skip(info.project.name === 'api', 'Bản nối API giới hạn số mã OTP mỗi số; luồng này đã có test máy chủ');
  await login(page, 'minh');
  await openProduct(page, 'giay converse');
  await page.getByRole('radio', { name: /Trả thẳng/ }).click();
  await page.locator('.buy-row .btn-buy').click();
  await page.getByRole('radio', { name: /Gặp trực tiếp/ }).click();
  await page.getByLabel(/nơi \/ giờ hẹn/).fill('Cổng chính HUIT 17h');
  await page.getByRole('button', { name: 'Đặt hàng' }).click();
  const mine = page.locator('.ocard').filter({ hasText: 'Converse' }).first();
  await expect(mine.locator('.ostatus')).toHaveText('Chờ giao trực tiếp');
  await mine.getByRole('button', { name: 'Hiện mã' }).click();
  const code = (await mine.locator('.hcode strong').textContent()).replace(/\D/g, '');
  expect(code).toMatch(/^\d{6}$/);

  await logout(page);
  await login(page, 'bao');
  await page.goto('#/kenh-nguoi-ban?don=can-gui');
  const sale = page.locator('.ocard').filter({ hasText: 'Converse' }).first();
  await expect(sale).toContainText('Cổng chính HUIT 17h');
  await sale.getByLabel(/Mã nhận hàng/).fill(code === '000000' ? '111111' : '000000');
  await sale.getByRole('button', { name: 'Xác nhận đã giao' }).click();
  await expect(page.locator('.toast, [role=status]').first()).toContainText('còn 4 lần');
  await sale.getByLabel(/Mã nhận hàng/).fill(code);
  await sale.getByRole('button', { name: 'Xác nhận đã giao' }).click();
  await page.getByRole('tab', { name: /Hoàn tất/ }).click();
  await expect(page.locator('.ocard').filter({ hasText: 'Converse' }).first().locator('.ostatus')).toHaveText('Hoàn tất');
});

test('rút tiền về tài khoản ngân hàng đã xác thực', async ({ page }) => {
  await login(page, 'lan');
  await page.goto('#/tai-khoan?tab=vi');
  await page.getByRole('button', { name: 'Rút tiền' }).click();
  await expect(page.getByRole('alert')).toContainText('trở lên');
  await page.getByLabel(/Số tiền rút/).fill('100000');
  await page.getByRole('button', { name: 'Rút tiền' }).click();
  await expect(page.locator('.txlist').first()).toContainText('100.000');
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

test('bàn phím: link bỏ qua đưa tới nội dung chính', async ({ page }) => {
  await page.goto('#/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /Bỏ qua, tới nội dung chính/ });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

for (const path of ['', 'tim-kiem?q=laptop', 'product', 'dang-nhap', 'tai-khoan?tab=don-mua', 'kenh-nguoi-ban']) {
  test(`không có lỗi truy cập (axe): /${path}`, async ({ page }) => {
    if (/^(tai-khoan|kenh)/.test(path)) await login(page, 'bao');
    if (path === 'product') await openProduct(page, 'thinkpad'); else await page.goto('#/' + path);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });
}
