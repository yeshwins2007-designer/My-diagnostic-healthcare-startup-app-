/**
 * Screenshots of every surface.
 *
 * Not assertions — a way to look at all five personas without signing in and
 * out five times. Run with:
 *
 *   npx playwright test screenshots --project=chromium
 *
 * Output lands in screenshots/ (gitignored).
 */

import { test, type Page } from '@playwright/test';

const OUT = 'screenshots';

async function signIn(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByRole('button', { name: /send me a code/i }).click();
  const otp = (await page.locator('strong.font-mono').first().innerText()).trim();
  await page.getByLabel(/six-digit code/i).fill(otp);
  await page.getByRole('button', { name: /verify and continue/i }).click();
  await page.waitForURL(/\/(caregiver|ops|field|lab)/);
}

async function shoot(page: Page, url: string, name: string) {
  // `networkidle` never settles here: the layout pulls webfonts from an
  // external host that this sandbox proxies slowly. `domcontentloaded` plus a
  // short settle is enough for a screenshot and does not hang.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

test.describe.configure({ mode: 'serial' });
// Capturing eight pages in one spec needs more than the default budget.
test.setTimeout(180_000);

test('public surfaces', async ({ page }) => {
  await shoot(page, '/', '01-landing');
  await shoot(page, '/plans', '02-plans');
  await shoot(page, '/trust', '03-trust');
  await shoot(page, '/join', '04-join-role-chooser');
});

test('elder mode', async ({ page }) => {
  await shoot(page, '/elder', '05-elder-home');

  await page.getByRole('button', { name: /change language/i }).click();
  await page.screenshot({ path: `${OUT}/06-elder-languages.png`, fullPage: true });

  await page.getByRole('button', { name: 'हिन्दी' }).click();
  await page.screenshot({ path: `${OUT}/07-elder-hindi.png`, fullPage: true });
});

test('caregiver', async ({ page }) => {
  await signIn(page, '9845000101');
  await shoot(page, '/caregiver', '08-caregiver-home');
  await shoot(page, '/caregiver/visits', '09-caregiver-visits');
  await shoot(page, '/caregiver/reports', '10-caregiver-reports');
  await shoot(page, '/caregiver/plan', '11-caregiver-plan');
  await shoot(page, '/caregiver/calls', '12-caregiver-calls');
  await shoot(page, '/caregiver/onboarding', '13-caregiver-add-parent');
});

test('operations', async ({ page }) => {
  await signIn(page, '9845000001');
  await shoot(page, '/ops', '14-ops-monday-numbers');
  await shoot(page, '/ops/gates', '15-ops-growth-gates');
  await shoot(page, '/ops/critical', '16-ops-critical-value');
  await shoot(page, '/ops/follow-ups', '17-ops-follow-ups');
  await shoot(page, '/ops/labs', '18-ops-nabl-verification');
  await shoot(page, '/ops/today', '19-ops-today');
  await shoot(page, '/ops/waitlist', '20-ops-waitlist');
  await shoot(page, '/ops/audit', '21-ops-audit-chain');
});

test('field technician', async ({ page }) => {
  await signIn(page, '9845000010');
  await shoot(page, '/field', '22-field-route');
});

test('partner laboratory', async ({ page }) => {
  await signIn(page, '9845100200');
  await shoot(page, '/lab', '23-lab-portal');
  await shoot(page, '/lab/agreement', '24-lab-agreement');
});
