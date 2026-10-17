/**
 * Deleting an account from inside the app, the way an App Store or Google
 * Play reviewer checks it: Profile, "Delete my account", confirm. The account
 * closes at once, this device is signed out, and the number cannot sign back
 * in. What happens to the data afterwards is covered by
 * tests/account-deletion.test.ts.
 */

import { test, expect, type Page } from '@playwright/test';

async function requestCode(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByRole('button', { name: /send me a code/i }).click();
  const code = page.locator('strong.font-mono').first();
  await expect(code).toBeVisible();
  await page.getByLabel(/six-digit code/i).fill((await code.innerText()).trim());
  await page.getByRole('button', { name: /verify and continue/i }).click();
}

test('a family deletes their account in the app and cannot sign back in', async ({ page }) => {
  test.setTimeout(120_000);
  const phone = '96' + String(Date.now()).slice(-8);

  await requestCode(page, phone);
  await page.getByLabel(/your name/i).fill('Anand Rao');
  await page.getByRole('button', { name: /create my account/i }).click();
  await page.waitForURL(/\/caregiver/);

  await page.goto('/caregiver/profile');
  const toggle = page.locator('#delete-account');
  const panel = page.locator('section[aria-labelledby="delete-account"] .disclosure > div');
  // Closed, the form is out of reach of Tab and screen readers.
  await expect(panel).toHaveAttribute('inert', '');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).not.toHaveAttribute('inert');
  await expect(page.getByText(/within 30 days we erase your details/i)).toBeVisible();
  await panel.getByLabel(/I understand\. Delete my account\./).check();
  await panel.getByRole('button', { name: 'Delete my account' }).click();

  await page.waitForURL(/\/account-deleted/);
  await expect(page.getByRole('heading', { name: /your account is deleted/i })).toBeVisible();

  // Signed out here.
  await page.goto('/caregiver');
  await page.waitForURL(/\/login/);

  // And the number no longer signs in. Waits out the 30-second resend limit.
  await page.waitForTimeout(31_000);
  await requestCode(page, phone);
  await expect(page.getByText(/this account was deleted/i)).toBeVisible();
  expect(page.url()).toMatch(/\/login/);
});

test('the deletion page works without the app or an account, as Google Play asks', async ({ page }) => {
  await page.goto('/delete-account');
  await expect(page.getByRole('heading', { name: /delete your medwyn account/i })).toBeVisible();
  await expect(page.getByText(/choose “delete my account”/i)).toBeVisible();
  await expect(page.getByText(/within 30 days/i)).toBeVisible();
  await page.goto('/support');
  await expect(page.getByRole('link', { name: 'Here’s how' })).toHaveAttribute('href', '/delete-account');
});
