/**
 * The assistant's calls, as a new family meets them: a sheet that explains
 * them once, after sign-up and never in the middle of booking, where nothing
 * is on until they turn it on; and the same choices kept in Profile.
 */

import { test, expect, type Page } from '@playwright/test';

async function newFamily(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByRole('button', { name: /send me a code/i }).click();
  const code = page.locator('strong.font-mono').first();
  await expect(code).toBeVisible();
  await page.getByLabel(/six-digit code/i).fill((await code.innerText()).trim());
  await page.getByRole('button', { name: /verify and continue/i }).click();
  await page.getByLabel(/your name/i).fill('Meera Krishnan');
  await page.getByRole('button', { name: /create my account/i }).click();
  await page.waitForURL(/\/caregiver\/onboarding/);
  await page.getByLabel(/their full name/i).fill('Saraswathi Krishnan');
  await page.getByLabel(/^Age/).fill('76');
  await page.getByLabel(/house number/i).fill('14, 11th Main, 4th Block');
  await page.getByLabel(/landmark/i).fill('Near the shopping complex');
  await page.getByLabel(/^City/).fill('Bengaluru');
  await page.getByLabel(/^State/).fill('Karnataka');
  await page.getByLabel(/pincode/i).fill('560011');
  await page.getByRole('button', { name: /add and book tests/i }).click();
  await page.waitForURL(/\/caregiver\/book/);
}

const sheetOf = (page: Page) => page.locator('[data-calls-sheet]');

test('a new family is shown the calls once, chooses some, and finds them in Profile', async ({ page }) => {
  test.setTimeout(90_000);
  await newFamily(page, '95' + String(Date.now()).slice(-8));

  // Never over booking.
  await expect(sheetOf(page)).toHaveCount(0);

  await page.goto('/caregiver');
  const sheet = page.getByRole('dialog', { name: /calls that take care of the small things/i });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('We call Saraswathi about fasting');

  await sheet.getByRole('button', { name: 'Continue' }).click();
  const choose = page.getByRole('dialog', { name: 'Choose your calls' });
  await expect(choose).toBeVisible();
  // Nothing is on until it is turned on.
  for (const s of await choose.getByRole('switch').all()) await expect(s).not.toBeChecked();
  await expect(choose.getByRole('button', { name: 'Save with no calls' })).toBeVisible();

  await choose.getByRole('switch', { name: /if no one opens the door/i }).check();
  await choose.getByRole('switch', { name: /when the report is ready/i }).check();
  await choose.getByLabel(/language saraswathi speaks/i).selectOption('ta');
  await choose.getByRole('button', { name: 'Turn on 2 calls' }).click();

  const done = page.getByRole('dialog', { name: 'You’re all set' });
  await expect(done).toContainText('2 calls are on');
  await done.getByRole('button', { name: 'Done' }).click();
  await expect(sheetOf(page)).toHaveCount(0);

  // Once only.
  await page.reload();
  await expect(page.locator('main').last()).toBeVisible();
  await expect(sheetOf(page)).toHaveCount(0);

  await page.goto('/caregiver/profile');
  const settings = page.locator('#calls');
  await expect(settings.getByRole('switch', { name: /if no one opens the door/i })).toBeChecked();
  await expect(settings.getByRole('switch', { name: /when the report is ready/i })).toBeChecked();
  await expect(settings.getByRole('switch', { name: /the night before a fasting test/i })).not.toBeChecked();
  await expect(settings.getByLabel(/language saraswathi speaks/i)).toHaveValue('ta');

  // Turned off in Profile, and it stays off.
  await settings.getByRole('switch', { name: /when the report is ready/i }).uncheck();
  await settings.getByRole('button', { name: 'Save calls' }).click();
  await expect(settings.getByRole('status')).toHaveText('Saved. One call is on.');
  await page.reload();
  await expect(page.locator('#calls').getByRole('switch', { name: /when the report is ready/i })).not.toBeChecked();

  // The sheet can be read again from Profile.
  await page.getByRole('button', { name: 'How our calls work' }).click();
  await expect(page.getByRole('dialog', { name: /calls that take care of the small things/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheetOf(page)).toHaveCount(0);
});

test('"Not now" turns nothing on and does not ask again', async ({ page }) => {
  test.setTimeout(90_000);
  await newFamily(page, '94' + String(Date.now()).slice(-8));
  await page.goto('/caregiver/visits');
  const sheet = page.getByRole('dialog', { name: /calls that take care of the small things/i });
  await expect(sheet).toBeVisible();
  const remembered = page.waitForResponse((r) => r.request().method() === 'POST');
  await sheet.getByRole('button', { name: 'Not now' }).click();
  await expect(sheetOf(page)).toHaveCount(0);
  await remembered;
  await page.goto('/caregiver');
  await expect(page.locator('main').last()).toBeVisible();
  await expect(sheetOf(page)).toHaveCount(0);
  await page.goto('/caregiver/profile');
  for (const s of await page.locator('#calls').getByRole('switch').all()) await expect(s).not.toBeChecked();
});

async function signIn(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByRole('button', { name: /send me a code/i }).click();
  const code = page.locator('strong.font-mono').first();
  await expect(code).toBeVisible();
  await page.getByLabel(/six-digit code/i).fill((await code.innerText()).trim());
  await page.getByRole('button', { name: /verify and continue/i }).click();
  await page.waitForURL(/\/(caregiver|field|ops)/);
}

test('a door nobody answers: the technician taps once, and the call shows on their screen', async ({ browser }) => {
  test.setTimeout(90_000);
  // The family has turned door calls on.
  const family = await browser.newPage();
  await signIn(family, '9845000102');
  await family.goto('/caregiver/profile');
  await family.locator('#calls').getByRole('switch', { name: /if no one opens the door/i }).check();
  await family.locator('#calls').getByRole('button', { name: 'Save calls' }).click();
  await expect(family.locator('#calls').getByRole('status')).toHaveText('Saved. One call is on.');

  const tech = await browser.newPage();
  await signIn(tech, '9845000010');
  await tech.goto('/field');
  await tech.getByRole('link', { name: /Vasant Deshpande/ }).first().click();
  await tech.getByRole('button', { name: 'I have arrived' }).click();
  await tech.getByRole('button', { name: 'No one is answering' }).click();
  // No phone line in a demo: it says plainly who it would have rung.
  await expect(tech.getByText(/Would call (Vasant|Rahul) now/)).toBeVisible();

  // And the coordinators see it.
  const ops = await browser.newPage();
  await signIn(ops, '9845000001');
  await ops.goto('/ops/calls');
  await expect(ops.locator('[data-call="MISSED_DOOR"]').first()).toContainText('If no one opens the door');
});
