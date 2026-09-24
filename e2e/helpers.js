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
  const totp = page.locator('#totp');
  if (await totp.isVisible().catch(() => false)) {
    await totp.fill('123456');
    await page.getByRole('button', { name: 'Xác nhận' }).click();
  }
  await expect(page.getByRole('button', { name: /Sản phẩm/ })).toBeVisible();
}
