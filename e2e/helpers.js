import { expect } from '@playwright/test';

export const DEMO = { lan: 'Trần Ngọc Lan', minh: 'Nguyễn Minh', huy: 'Lê Quốc Huy', bao: 'Phạm Gia Bảo', admin: 'Quản trị ReOwn' };

export async function fresh(page) {
  await page.goto('#/');
  await page.evaluate(() => localStorage.clear());
}

export async function login(page, who) {
  await page.goto('#/dang-nhap');
  await page.getByRole('button', { name: new RegExp(DEMO[who]) }).click();
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.locator('.pmenu-btn')).toBeVisible();
}

export async function logout(page) {
  await page.locator('.pmenu-btn').click();
  await page.getByRole('menuitem', { name: /Đăng xuất|Đổi tài khoản/ }).click();
  await expect(page.locator('.pmenu-btn')).toHaveCount(0);
}

export async function openProduct(page, query) {
  await page.goto('#/tim-kiem?q=' + encodeURIComponent(query));
  await page.locator('.results .pcard').first().click();
  await expect(page.locator('.pd-info h1')).toBeVisible();
}

export async function adminGate(page) {
  await page.goto('#/quan-tri');
  // Trang quản trị tải lười: đợi hẳn một trong hai màn (nhập mã 2 lớp hoặc bảng quản trị) rồi mới quyết định
  const totp = page.locator('#totp');
  const nav = page.locator('.adm-nav');
  await expect(totp.or(nav)).toBeVisible();
  if (await totp.isVisible()) {
    await totp.fill('123456');
    await page.getByRole('button', { name: 'Xác nhận' }).click();
  }
  await expect(nav.getByRole('button', { name: /Sản phẩm/ })).toBeVisible();
}
