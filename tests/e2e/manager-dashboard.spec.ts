import { expect, test } from '@playwright/test';

test('manager dashboard loads', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'JX Compose Manager' })).toBeVisible();
});

test('backup workspace tabs are visible', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('tab', { name: 'Sao lưu (Backup)' }).click();

  await expect(page.getByRole('tab', { name: 'Files' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Schedule' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Jobs' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible();
});
