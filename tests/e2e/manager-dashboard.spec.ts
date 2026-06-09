import { expect, test } from '@playwright/test';

test('manager dashboard loads', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'JX Compose Manager' })).toBeVisible();
});

test('backup panel is visible', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Database backup / restore')).toBeVisible();
});
