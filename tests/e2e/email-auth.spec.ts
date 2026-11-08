/**
 * Email + password, end to end: sign up proving both the email and the phone,
 * sign out, sign in, forget the password, reset it.
 */
import { test, expect, type Page } from '@playwright/test';

const stamp = Date.now();
const EMAIL = `e2e-${stamp}@example.com`;
const PHONE = `9${String(stamp).slice(-9)}`;
const FIRST = 'quiet harbour morning tide';
const SECOND = 'lantern over the paddy field';

async function emailTab(page: Page) {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Email' }).click();
}

async function signOut(page: Page) {
  await page.goto('/caregiver/profile');
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/caregiver'));
}

async function signIn(page: Page, email: string, password: string) {
  await emailTab(page);
  await page.getByRole('textbox', { name: /^email/i }).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('the seeded family signs in with email and password', async ({ page }) => {
  await signIn(page, 'anjali.iyer@example.com', 'monsoon-tea-garden');
  await page.waitForURL(/\/caregiver$/);
  await page.goto('/caregiver/profile');
  await expect(page.getByText('anjali.iyer@example.com', { exact: true })).toBeVisible();
});

test('sign up with email, sign in, forget the password and reset it', async ({ page }) => {
  test.setTimeout(120_000);

  // Sign up: details, then a code from the email AND one from the phone.
  await emailTab(page);
  await page.getByRole('button', { name: /create an account with email/i }).click();
  await page.getByLabel('Your name').fill('Kavya Rao');
  await page.getByRole('textbox', { name: /^email/i }).fill(EMAIL);
  await page.getByLabel('Mobile number').fill(PHONE);
  await page.getByLabel('Choose a password').fill(FIRST);
  await page.getByRole('button', { name: /show password/i }).click();
  await expect(page.getByLabel('Choose a password')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Send my codes' }).click();

  const emailCode = page.locator('[data-dev-code="email"]');
  await expect(emailCode).toBeVisible();
  const smsCode = (await page.locator('[data-dev-code="sms"]').innerText()).trim();

  // The wrong text-message code is refused, and nothing is created.
  await page.getByLabel('Code from your email').fill((await emailCode.innerText()).trim());
  await page.getByLabel('Code from the text message').fill(smsCode === '111111' ? '222222' : '111111');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByText(/text message code:/i)).toBeVisible();

  await page.getByLabel('Code from your email').fill((await emailCode.innerText()).trim());
  await page.getByLabel('Code from the text message').fill(smsCode);
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.waitForURL(/\/caregiver\/onboarding/);

  // Sign out, and back in with email and password.
  await signOut(page);
  await signIn(page, EMAIL, FIRST);
  await page.waitForURL(/\/caregiver/);
  await signOut(page);

  // A wrong password: a plain refusal, and the email stays filled in.
  await signIn(page, EMAIL, 'not the password at all');
  await expect(page.getByText(/do not match/i)).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^email/i })).toHaveValue(EMAIL);

  // Forgot password: a code by email, a new password, and in.
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel(/your account’s email/i).fill(EMAIL);
  await page.getByRole('button', { name: 'Send reset code' }).click();
  const resetCode = page.locator('[data-dev-code="reset"]');
  await expect(resetCode).toBeVisible();
  await page.getByLabel('Code from your email').fill((await resetCode.innerText()).trim());
  await page.getByLabel('New password').fill(SECOND);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await page.waitForURL(/\/caregiver/);

  // The old password is dead; the new one works.
  await signOut(page);
  await signIn(page, EMAIL, FIRST);
  await expect(page.getByText(/do not match/i)).toBeVisible();
  await signIn(page, EMAIL, SECOND);
  await page.waitForURL(/\/caregiver/);
});

test('the phone tab is still the default, and still works', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('tab', { name: 'Phone' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel(/mobile number/i)).toBeVisible();
});
